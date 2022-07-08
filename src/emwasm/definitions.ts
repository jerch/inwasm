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
 * Note that synchronous processing of wasm modules/instance is highly restricted
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
  name: string,
  // Type determines, whether to provide bytes | module | instance at runtime.
  type: OutputType,
  // Sync (discouraged) vs. async wasm bootstrapping at runtime.
  mode: OutputMode,
  // custom compiler settings
  compile?: {
    // Custom cmdline defines, e.g. {ABC: 123} provided as -DABC=123 to the compiler.
    defines?: {[key: string]: string | number},
    // Additional include paths, should be absolute. (TODO...)
    include?: string[],
    // Additional source files (copied over). (TODO...)
    sources?: string[],
    // FIXME: check support for -lxy with wasm
    //libs?: string[],
    // Custom cmdline switches, overriding any from above. (TODO...)
    switches?: string[],
  }
  // whether to treat `code` below as C or C++ source.
  srctype: 'C' | 'C++',
  // Exported wasm functions, for proper TS typing simply stub them.
  exports: {[key: string]: Function | WebAssembly.Global},  // FIXME: is general symbol export possible with EM?
  // Name of the env import object (must be visible at runtime). Only used for instance.
  imports?: string,
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
 * Inline wasm from a source definition.
 *
 * The processing happens in several stages:
 *
 * 1. coding stage
 * Place a `EmWasm` call with a valid wasm source definition (see `IWasmDefinition` above)
 * in a TS source file. Ideally the source module has no complicated imports
 * (close to leaves in dependency tree, no cycling).
 *
 * `EmWasm` and source definition come with some restrictions:
 * - A definition must be surrounded by special sentinel comments as of
 *
 *      `EmWasm( /* ##EMWASM## *\/ {..your definition goes here..} /* ##\EMWASM## *\/ )`
 *
 *   (without the \ after the *). Without those sentinels the compiler script will
 *   not find the corresponding code blocks. `EmWasm` with the sentinels currently
 *   operates as a source macro, therefore every source definition must have its own
 *   `EmWasm` + sentinels call surrounding it literally in source. Any sort of
 *   function or identifier indirection will either not compile or scramble the JS source.
 * - Values provided to the source definition must be final and not change later at runtime.
 *   This results from the fact, that most values get compiled into the wasm binary and cannot
 *   be altered anymore.
 *
 * Some of the restrictions above might get lifted with more advanced AST parsing
 * in the future.
 *
 * 2. compile stage
 * After TS compilation run `emwasm` on files containing `EmWasm` calls.
 * `emwasm` grabs the source definitions from partial execution, compiles them into
 * wasm binaries and replaces the source definitions with base64 encoded runtime definitions.
 * Note that this currently happens inplace, thus the original file content gets overwritten.
 * Alternatively run `emwasm` in watch mode with `emwasm -w glob*pattern`.
 * Note: `emwasm` does not yet work with ES6 modules.
 *
 * 3. runtime stage
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
