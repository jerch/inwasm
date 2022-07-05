/**
 * EM_WASM decl stuff (to be moved into own lib)
 */
declare const _emwasm_compiler: any;

function EmWasm<T>(definition: T) {
  if (typeof _emwasm_compiler !== 'undefined') {
    _emwasm_compiler.add_unit(definition);
  }
  throw new Error('must call emwasm compile');
  return definition;
}
/* end: EM_WASM decl stuff */

/**
 * TODO:
 * - morph EmWasm return type, so TS finds proper types
 * - support several build flags
 * - support multiple compile units for different feature set (eg. scalar vs. simd)
 * - different embed styles: inline-immediate, inline-sync
 * - ES6 module vs require/UMD support
 */


// ##EM_WASM## unit
const unit = EmWasm({
  name: 'unit',
  defines: {CHUNK_SIZE: 4096},
  exports: {
    memory: new WebAssembly.Memory({initial: 0, maximum: 0}),
    chunk_addr: () => 0,
    target_addr: () => 0,
    convert: (length: number) => 0
  },
  code: `
  static unsigned char CHUNK[CHUNK_SIZE] __attribute__((aligned(16)));
  static unsigned char TARGET[CHUNK_SIZE/2] __attribute__((aligned(16)));
  
  void* chunk_addr() { return &CHUNK[0]; }
  void* target_addr() { return &TARGET[0]; }
  int convert(int length);
  
  int convert(int length) {
    unsigned char *src = CHUNK + 1;
    unsigned char *dst = TARGET;
    int len = length / 2;
    for (; len--; src += 2) {
      *dst++ = *src;
    }
    return dst - TARGET;
  }
  `
});
// ##END_EM_WASM## unit

const CHUNK = new Uint8Array(unit.exports.memory.buffer, unit.exports.chunk_addr(), unit.defines.CHUNK_SIZE);
const TARGET = new Uint8Array(unit.exports.memory.buffer, unit.exports.target_addr(), unit.defines.CHUNK_SIZE / 2);
export function convert16BitTo8BitData(data: Uint16Array, target?: Uint8Array): Uint8Array {
  const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const end = data.byteLength;
  const result = target || new Uint8Array(end / 2);
  let p = 0;
  let offset = 0;
  while (p < end) {
    const length = Math.min(end - p, unit.defines.CHUNK_SIZE);
    CHUNK.set(view.subarray(p, p += length));
    const rlen = unit.exports.convert(length);
    result.set(TARGET.subarray(0, rlen), offset);
    offset += rlen;
  }
  return new Uint8Array(result.buffer, 0, data.length);
}

console.log(
  convert16BitTo8BitData(new Uint16Array([
    0x1122, 0x3344, 0x5566, 0x7788, 0x1122, 0x3344, 0x5566, 0x7788,
    0x1122, 0x3344, 0x5566, 0x7788, 0x1122, 0x3344, 0x5566, 0x7788
  ]))
);

const env = {jsadd: (a: number, b: number) => a + b}

// ##EM_WASM## second
const second = EmWasm({
  name: 'second',
  defines: {},
  imports: 'env',
  exports: {
    memory: new WebAssembly.Memory({initial: 0, maximum: 0}),
    add: (a: number, b: number) => 0
  },
  code: `
  int jsadd(int a, int b);
  int add(int a, int b) {
    return jsadd(a, b);
  }
  `
});
// ##END_EM_WASM## second
