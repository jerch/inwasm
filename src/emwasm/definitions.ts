/**
 * Output type of `EmWasm`.
 * Determines whether to return bytes, a wasm module or a wasm instance.
 * Returns for async corresponding promises.
 */
export const enum OutputType {
  INSTANCE = 0,
  MODULE = 1,
  BYTES = 2
}


/**
 * Whether `EmWasm` returns the requested type sync or async (promise).
 * Note that synchronous processing of wasm modules/instances is highly restricted
 * in browsers' main JS context (works only reliable in nodejs or a web worker).
 */
export const enum OutputMode {
  ASYNC = 0,
  SYNC = 1
}


/**
 * Wasm source definition, holds all relevant compiler info.
 */
export interface IWasmDefinition {
  // Name of the wasm target, should be unique.
  name: string;
  // Type determines, whether to provide bytes | module | instance at runtime.
  type: OutputType;
  // Sync (discouraged) vs. async wasm bootstrapping at runtime.
  mode: OutputMode,
  // Exported wasm functions, for proper TS typing simply stub them.
  exports: {[key: string]: Function | WebAssembly.Global};
  // Name of the env import object (must be visible at runtime). Only used for OutputType.INSTANCE.
  imports?: string;
  // whether to treat `code` below as C or C++ source.
  srctype: 'C' | 'C++' | 'Clang-C' | 'Zig' | 'wat' | 'custom' | 'Rust';
  // custom compiler settings
  compile?: {
    // Custom cmdline defines, e.g. {ABC: 123} provided as -DABC=123 to the compiler.
    defines?: {[key: string]: string | number};
    // Additional include paths, should be absolute. (TODO...)
    include?: string[];
    // Additional source files (copied over). (TODO...)
    sources?: string[];
    // FIXME: check support for -lxy with wasm
    //libs?: string[],
    // Custom cmdline switches, overriding any from above. (TODO...)
    switches?: string[];
  };
  customRunner?: (definition: IWasmDefinition, buildDir: string) => Uint8Array;
  // Inline source code (C or C++).
  code: string
}
interface IWasmDefinitionSync extends IWasmDefinition {
  mode: OutputMode.SYNC
}
interface IWasmDefinitionAsync extends IWasmDefinition {
  mode: OutputMode.ASYNC
}
interface IWasmDefinitionSyncBytes extends IWasmDefinitionSync {
  type: OutputType.BYTES;
}
interface IWasmDefinitionSyncModule extends IWasmDefinitionSync {
  type: OutputType.MODULE;
}
interface IWasmDefinitionSyncInstance extends IWasmDefinitionSync {
  type: OutputType.INSTANCE;
}
interface IWasmDefinitionAsyncBytes extends IWasmDefinitionAsync {
  type: OutputType.BYTES;
}
interface IWasmDefinitionAsyncModule extends IWasmDefinitionAsync {
  type: OutputType.MODULE;
}
interface IWasmDefinitionAsyncInstance extends IWasmDefinitionAsync {
  type: OutputType.INSTANCE;
}
// TODO: is there a way to infer export/import typing across lazy bytes --> module instantiation?

// extends WebAssembly.Instance with proper exports typings
export interface WasmInstance<T extends IWasmDefinition> extends WebAssembly.Instance {
  exports: {memory: WebAssembly.Memory} & T['exports'];
}

// tiny compile ctx for emwasm
export interface _IEmWasmCtx {
  // adds definition for compile evaluation and raises
  add(def: IWasmDefinition): void;
}


// runtime helper - decode base64
function _dec(s: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64');
  const bs = atob(s);
  const r = new Uint8Array(bs.length);
  for (let i = 0; i < r.length; ++i) r[i] = bs.charCodeAt(i);
  return r;
}
// runtime helper - set imports conditionally
function _env(env: any): {env: any} | undefined {
  return env ? {env: env} : undefined
}
// runtime helper - create response object
function _res(d: string): Response {
  return new Response(_dec(d), {status: 200, headers: {'Content-Type': 'application/wasm'}})
}


// compiler ctx helper (only defined during compile run from emwasm)
declare const _emwasmCtx: _IEmWasmCtx;


/**
 * Embed wasm inline from a source definition.
 *
 * coding stage\
 * Place a `EmWasm` call with a valid wasm source definition (see `IWasmDefinition`)
 * in a TS source file.
 *
 * `EmWasm` with its source definition has a few additional coding restrictions:
 *   - The source module should not have complicated imports (close to leaves in dependency tree,
 *     no cycling) and should import `EmWasm` directly.
 *   - The wasm definition must be coded inline as literal object on distinct
 *     `EmWasm` calls, eg. `EmWasm({...})`.
 *   - All `EmWasm` calls must execute on import of the module (e.g. defined at top level),
 *     as the compiler script relies on partial import execution.
 *   - Importing the module should be side-effect free, eg. not contain other complicated
 *     state altering constructs at top level.
 *   - Values provided to the source definition must be final and not change later at runtime.
 *     This results from the fact, that most values get compiled into the wasm binary and
 *     cannot be altered later on anymore.
 *
 * compile stage\
 * After TS compilation run `emwasm` on files containing `EmWasm` calls.
 * `emwasm` grabs the source definitions from partial execution, compiles them into
 * wasm binaries and replaces the source definitions with base64 encoded runtime definitions.
 * Note that this currently happens inplace, thus the original file content gets overwritten.
 * Alternatively run `emwasm` in watch mode with `emwasm -w glob*pattern`.
 * Note: `emwasm` does not yet work with ES6 modules.
 *
 * runtime stage\
 * At runtime `EmWasm` decodes the base64 wasm data and returns the requested output type
 * (bytes, module or instance; as promises for async mode).
 * If the compilation step was skipped in between, `EmWasm` will throw an error.
 */
export function EmWasm(def: IWasmDefinitionSyncBytes): Uint8Array;
export function EmWasm(def: IWasmDefinitionAsyncBytes): Promise<Uint8Array>;
export function EmWasm(def: IWasmDefinitionSyncModule): WebAssembly.Module;
export function EmWasm(def: IWasmDefinitionAsyncModule): Promise<WebAssembly.Module>;
export function EmWasm<T extends IWasmDefinitionSyncInstance>(def: T): WasmInstance<T>;
export function EmWasm<T extends IWasmDefinitionAsyncInstance>(def: T): Promise<WasmInstance<T>>;
export function EmWasm<T extends IWasmDefinition>(def: T): any {
  if ((def as any).d) {
    // default compiled call: wasm loading during runtime
    // for the sake of small bundling size (<900 bytes) the code is somewhat degenerated
    // see cli.ts for the meaning of the {t, s, d, e} object properties
    const {t, s, d, e} = def as any;
    const W = WebAssembly;
    if (t === OutputType.BYTES) {
      if (s) return _dec(d);
      return Promise.resolve(_dec(d));
    }
    if (t === OutputType.MODULE) {
      if (s) return new W.Module(_dec(d));
      if (typeof W.compileStreaming === 'undefined') return W.compile(_dec(d));
      return W.compileStreaming(_res(d));
    }
    if (s)
      return new W.Instance(new W.Module(_dec(d)), _env(e)) as WasmInstance<T>;
    if (typeof W.instantiateStreaming === 'undefined')
      return W.instantiate(_dec(d), _env(e))
        .then(inst => inst.instance as WasmInstance<T>);
    return W.instantiateStreaming(_res(d), _env(e))
      .then(inst => inst.instance as WasmInstance<T>);
  }
  // invalid call: uncompiled normal run throws
  if (typeof _emwasmCtx === 'undefined') throw new Error('must run "emwasm"');
  _emwasmCtx.add(def);
}
