declare const _emwasmCtx: _IEmWasmCtx;

/**
 * TODO:
 * - support several build flags
 * - support multiple compile units for different feature set (eg. scalar vs. simd)
 * - ES6 module vs require/UMD support
 */

/**
 * mode x output matrix with needed bootstrap steps
 *
 *    mode        output      steps
 *    sync        bytes       decode b64 --> Uint8Array
 *                module      decode b64 --> new Module(bytes)
 *                instance    decode b64 --> new Instance(new Module(bytes))
 *    async       bytes       decode b64 --> Promise(Response(bytes))
 *                module      decode b64 --> WebAssembly.compile(bytes) --- nodejs
 *                            WebAssembly.compileStreaming(Promise(dec b64)) --- preferred
 *                instance    decode b64 --> WebAssembly.instantiate(bytes, imports) --- nodejs
 *                            WebAssembly.instantiateStreaming(Promise(dec b64), imports) --- preferred
 */

export const enum WasmFeature {
  DEFAULT = 0,
  SIMD = 1,
  BIGINT = 2,
  THREADS = 4
}

export interface TDefinition {
  name: string,
  mode: 'sync' | 'async',
  compile?: {
    defines?: {[key: string]: string | number},
    include?: string[],
    sources?: string[],
    libs?: string[],
    switches?: string[],
  }
  featureSets?: WasmFeature[],
  srctype: 'C' | 'C++',
  exports: {[key: string]: Function},
  imports?: string,
  code: string
}
interface TDefinitionSync extends TDefinition {
  mode: 'sync'
}
interface TDefinitionAsync extends TDefinition {
  mode: 'async'
}

export interface WasmInstance<T extends TDefinition> extends WebAssembly.Instance {
  exports: {memory: WebAssembly.Memory} & T['exports'];
  defines: T['compile'] extends {defines: any} ? T['compile']['defines'] : undefined;
}

export type TGenerate = 'bytes' | 'module' | 'instance';
export interface _IEmWasmCtx {
  addUnit(def: TDefinition, generate: TGenerate): void;
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


// array dummy
const ZERO_BYTES = new Uint8Array();


/**
 * TODO...
 */
export function EmWasmBytes(def: TDefinitionSync): Uint8Array;
export function EmWasmBytes(def: TDefinitionAsync): Promise<Response>;
export function EmWasmBytes<T extends TDefinition>(def: T): any {
  // TODO...
  if (typeof _emwasmCtx === 'undefined') {
    throw new Error('must call emwasm');
  }
  _emwasmCtx.addUnit(def, 'bytes');
  if (def.mode === 'sync') {
    return ZERO_BYTES;
  }
  return Promise.resolve(new Response());
}


/**
 * TODO...
 */
export function EmWasmModule(def: TDefinitionSync): WebAssembly.Module;
export function EmWasmModule(def: TDefinitionAsync): Promise<WebAssembly.Module>;
export function EmWasmModule<T extends TDefinition>(def: T): any {
  // TODO...
  if (typeof _emwasmCtx === 'undefined') {
    throw new Error('must call emwasm');
  }
  _emwasmCtx.addUnit(def, 'module');
  if (def.mode === 'sync') {
    return new WebAssembly.Module(ZERO_BYTES);
  }
  return WebAssembly.compileStreaming(new Response());
}


/**
 * Generate an inline wasm instance sync or async.
 * Sync mode is generally discouraged and should only be used in nodejs or a worker ctx.
 * 
 * Returns a wasm instance (promise), additionally with .defines as given from source.
 */
export function EmWasmInstance<T extends TDefinitionSync>(def: T): WasmInstance<T>;
export function EmWasmInstance<T extends TDefinitionAsync>(def: T): Promise<WasmInstance<T>>;
export function EmWasmInstance<T extends TDefinition>(def: T): any {
  if ((def as any).data) {
    // compiled: normal call at runtime later on
    const d = def as any;
    if (d.sync) {
      const mod = new WebAssembly.Module(_dec(d.data));
      return addDefines(
        new WebAssembly.Instance(mod, d.env ? {env: d.env} : undefined) as WasmInstance<T>,
        d.defines
      );
    }
    if (typeof WebAssembly.instantiateStreaming === 'undefined') {
      return WebAssembly.instantiate(
        _dec(d.data),
        d.env ? {env: d.env} : undefined
      ).then(inst => addDefines(inst.instance as WasmInstance<T>, d.defines));
    }
    return WebAssembly.instantiateStreaming(
      new Response(
        _dec(d.data),
        {status: 200, headers: {'Content-Type': 'application/wasm'}}
      ),
      d.env ? {env: d.env} : undefined
    ).then(inst => addDefines(inst.instance as WasmInstance<T>, d.defines));
  }
  // uncompiled: throw exception to run emwasm first
  if (typeof _emwasmCtx === 'undefined') {
    throw new Error('must call emwasm');
  }
  // run from emwasm
  _emwasmCtx.addUnit(def, 'instance');
  // unreachable (addUnit raises on purpose)
}
