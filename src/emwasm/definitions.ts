/**
 * TODO:
 * - ES6 module vs require/UMD support
 */


export const enum OutputType {
  DEFAULT = 0,
  INSTANCE = 0,
  MODULE = 1,
  BYTES = 2
}


export const enum OutputMode {
  ASYNC = 0,
  SYNC = 1
}


export interface TDefinition {
  name: string,
  type: OutputType,
  mode: OutputMode,
  compile?: {
    defines?: {[key: string]: string | number},
    include?: string[],
    sources?: string[],
    libs?: string[],
    switches?: string[],
  }
  srctype: 'C' | 'C++',
  exports: {[key: string]: Function},
  imports?: string,
  code: string
}
interface TDefinitionSync extends TDefinition {
  mode: OutputMode.SYNC
}
interface TDefinitionAsync extends TDefinition {
  mode: OutputMode.ASYNC
}
interface TDefinitionSyncBytes extends TDefinitionSync {
  type: OutputType.BYTES;
}
interface TDefinitionSyncModule extends TDefinitionSync {
  type: OutputType.MODULE;
}
interface TDefinitionSyncInstance extends TDefinitionSync {
  type: OutputType.INSTANCE;
}
interface TDefinitionAsyncBytes extends TDefinitionAsync {
  type: OutputType.BYTES;
}
interface TDefinitionAsyncModule extends TDefinitionAsync {
  type: OutputType.MODULE;
}
interface TDefinitionAsyncInstance extends TDefinitionAsync {
  type: OutputType.INSTANCE;
}


export interface WasmInstance<T extends TDefinition> extends WebAssembly.Instance {
  exports: {memory: WebAssembly.Memory} & T['exports'];
  defines: T['compile'] extends {defines: any} ? T['compile']['defines'] : undefined;
}


export interface _IEmWasmCtx {
  addUnit(def: TDefinition): void;
}


// helper to decode base64
function _dec(s: string) {
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64');
  const bs = atob(s);
  const r = new Uint8Array(bs.length);
  for (let i = 0; i < r.length; ++i) r[i] = bs.charCodeAt(i);
  return r;
}

// helper to add defines to instance
function addDefines<T extends TDefinition>(inst: WasmInstance<T>, defines: any) {
  if (defines) {
    inst.defines = defines;
  }
  return inst;
}


// compiler ctx helper (only defines during compile run)
declare const _emwasmCtx: _IEmWasmCtx;


/**
 * Generate inline wasm from a definition.
 */
export function EmWasm(def: TDefinitionSyncBytes): Uint8Array;
export function EmWasm(def: TDefinitionAsyncBytes): Promise<Uint8Array>;
export function EmWasm(def: TDefinitionSyncModule): WebAssembly.Module;
export function EmWasm(def: TDefinitionAsyncModule): Promise<WebAssembly.Module>;
export function EmWasm<T extends TDefinitionSyncInstance>(def: T): WasmInstance<T>;
export function EmWasm<T extends TDefinitionAsyncInstance>(def: T): Promise<WasmInstance<T>>;
export function EmWasm<T extends TDefinition>(def: T): any {
  if ((def as any).data) {
    // normal compiled runtime call: actual wasm initialization
    const W = WebAssembly;
    const d = def as any;
    if (d.type === OutputType.BYTES) {
      if (d.sync) return _dec(d.data);
      return Promise.resolve(_dec(d.data));
    }
    if (d.type === OutputType.MODULE) {
      if (d.sync) return new W.Module(_dec(d.data));
      if (typeof W.compileStreaming === 'undefined') return W.compile(_dec(d.data));
      return W.compileStreaming(
        new Response(_dec(d.data), {status: 200, headers: {'Content-Type': 'application/wasm'}})
      );
    }
    if (d.sync)
      return addDefines(
        new W.Instance(new W.Module(_dec(d.data)), d.env ? {env: d.env} : undefined) as WasmInstance<T>,
        d.defines
      );
    if (typeof W.instantiateStreaming === 'undefined')
      return W.instantiate(_dec(d.data), d.env ? {env: d.env} : undefined)
        .then(inst => addDefines(inst.instance as WasmInstance<T>, d.defines));
    return W.instantiateStreaming(
      new Response(_dec(d.data), {status: 200, headers: {'Content-Type': 'application/wasm'}}),
      d.env ? {env: d.env} : undefined
    ).then(inst => addDefines(inst.instance as WasmInstance<T>, d.defines));
  }
  // invalid precomiled run throws error
  if (typeof _emwasmCtx === 'undefined') throw new Error('must call emwasm');
  _emwasmCtx.addUnit(def);
}
