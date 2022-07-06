import { DATA } from './wasm';


/**
 * Interface declaration of exported symbols from wasm code.
 */
interface IWasmExports extends Record<string, WebAssembly.ExportValue> {
  /**
   * Every wasm instance has some sort of memory, which can either be compiled-in
   * or provided from own Memory object from Javascript side.
   * This example uses compiled-in memory, so we dont have to care further during
   * instantiation.
   */
  memory: WebAssembly.Memory;
  /**
   * The example function is a simple convert function with some input (chunk)
   * and some output (target). The following functions provide their memory offsets,
   * so we can read/write on them within their limits.
   */
  /**
   * Start offset of CHUNK to write data for conversion (up to CHUNK_SIZE).
   */
  chunk_addr(): number;
  /**
   * Start offset of TARGET to read converted data (up to CHUNK_SIZE/2).
   */
  target_addr(): number;
  /**
   * Convert `length` bytes (!) loaded in CHUNK.
   * Returns number of written bytes to TARGET.
   */
  convert(length: number): number;
}


// base64 decode helper for nodejs and browser
function decodeBase64(s: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'base64');
  }
  const bytestring = atob(s);
  const result = new Uint8Array(bytestring.length);
  for (let i = 0; i < result.length; ++i) {
    result[i] = bytestring.charCodeAt(i);
  }
  return result;
}


/**
 * Re-assign settings data we are going to use.
 * This is technically not needed here, but helps with bigger
 * wasm modules with class wrappers to not decode bytes over and over.
 */
const WASM = {
  CHUNK_SIZE: DATA.CHUNK_SIZE,
  BYTES: decodeBase64(DATA.BYTES),
  BYTES_SIMD: decodeBase64(DATA.BYTES_SIMD)
};


/**
 * Compile wasm module.
 * We can do it synchronously here, since the module is very small
 * and compiles very fast.
 * Note that the synchronous way is highly discouraged
 * and will not work for modules > 4096 bytes anymore (needs async patch).
 * 
 * Our wasm build contains a scalar and a simd variant.
 * Since simd is much faster, we try that first and fall back to scalar,
 * if something goes wrong (safari currently does not support wasm-simd).
 */
const wasm_mod = (() => {
  let m: WebAssembly.Module;
  try {
    m = new WebAssembly.Module(WASM.BYTES_SIMD);
  } catch (e) {
    m = new WebAssembly.Module(WASM.BYTES);
  }
  return m;
})();


/**
 * Create a wasm instance.
 * Since our wasm module is really tiny and does not preserve
 * state between later `convert` calls, we can stick to
 * a single global instance.
 * For more complex wasm functionality this is not possible anymore,
 * there the following declarations would have to go into a wrapper class.
 */
const inst = new WebAssembly.Instance(wasm_mod);
// access helper with proper types
const _wasm = inst.exports as IWasmExports;
// CHUNK memory
const CHUNK = new Uint8Array(_wasm.memory.buffer, _wasm.chunk_addr(), WASM.CHUNK_SIZE);
// TARGET memory
const TARGET = new Uint8Array(_wasm.memory.buffer, _wasm.target_addr(), WASM.CHUNK_SIZE / 2);


/**
 * Wrapper to `wasm.convert`, which does the actual conversion of 16bit to 8bit.
 * This is the only exported function, everything else is decoration to get wasm rolling.
 * 
 * Since the wasm module is compiled with fixed static memory, we have to do
 * chunkify bigger inputs and join the results back.
 * `target` is an optional write target to avoid memory reallocation.
 * 
 * The way things are exposed above by memory segments is very lowish, but this gives
 * us more power to intervene with wasm state. emscripten also provides higher level
 * interfaces, but using those pulls in a very fat runtime lib on wasm and JS side.
 * This is def. not needed here resulting in very slim code.
 */
export function convert16BitTo8BitData(data: Uint16Array, target?: Uint8Array): Uint8Array {
  const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const end = data.byteLength;
  const result = target || new Uint8Array(end / 2);
  let p = 0;
  let offset = 0;
  while (p < end) {
    const length = Math.min(end - p, WASM.CHUNK_SIZE);
    CHUNK.set(view.subarray(p, p += length));
    const rlen = _wasm.convert(length);
    result.set(TARGET.subarray(0, rlen), offset);
    offset += rlen;
  }
  return new Uint8Array(result.buffer, 0, data.length);
}


export { second } from './inline';
