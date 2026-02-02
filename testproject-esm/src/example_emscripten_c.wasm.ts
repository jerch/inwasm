import { InWasm, OutputMode, OutputType, WebAssemblyExtended } from 'inwasm-runtime';

/**
 * memory calculations:
 * - converter reduces 16 bit input (2 bytes) to 8 bit output (1 byte)
 *   --> 3 bytes needed per output byte
 * - no stack memory used at all
 *   --> TOTAL_STACK=0
 * - wasm memory page is 65536 bytes
 *   --> 65536 / 3 = ~21845 output bytes
 *   --> Important: cannot use full page, as it always reverses lower 1024 bytes
 * --> clamp converted byte amount to lower 2^n:
 *     2^32 input bytes + 2^16 output bytes = 49152
 * --> SETTINGS.chunkSize denotes input bytes --> 32768
 *
 * Very aggressive memory & runtime optimization (not used in the example below):
 * The chunkwise conversion creates high runtime from memcpy of the input and output bytes to/from wasm.
 * This can be partially avoided by creating a new wasm instance for every conversion task with
 * properly adjusted imported memory, that can hold all input bytes at once and does an inplace
 * overwrite of input bytes --> output bytes (directly possible due to slower output progression).
 * Whether such an optimization gains anything, depends on highly on runtime pressure from wasm instantation
 * and memory allocation (memory is always newly allocated for every instance).
 * The example does not use such an optimization, instead it relies on fixed memory footprint (just one page)
 * of a singleton wasm instance copying input/output bytes chunkwise over. Currently this seems to be
 * the better general purpose approach.
 */
const SETTINGS = {
  chunkSize: 32768  // see memory calculations above
} as const;


const importObj = {
  env: {
    memory: new WebAssembly.Memory({initial: 1, maximum: 1})
  }
}


const convert_simd = InWasm({
  name: 'convert-simd',
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  compile: {
    defines: { CHUNK_SIZE: SETTINGS.chunkSize },
    switches: ['-msimd128', '-msse', '-msse2', '-mssse3', '-msse4.1', '-s TOTAL_STACK=0', '-s IMPORTED_MEMORY=1']
  },
  imports: importObj,
  exports: {
    chunk_addr: () => 0,
    target_addr: () => 0,
    convert: (length: number) => 0,
    //memory: new WebAssembly.Memory({initial: 1, maximum: 1})
  },
  code: `
static unsigned char CHUNK[CHUNK_SIZE] __attribute__((aligned(16)));
static unsigned char TARGET[CHUNK_SIZE/2] __attribute__((aligned(16)));

void* chunk_addr() { return &CHUNK[0]; }
void* target_addr() { return &TARGET[0]; }
int convert(int length);

#include <immintrin.h>
int convert(int length) {
  unsigned char *src = CHUNK;
  unsigned char *dst = TARGET;
  int len = length / 32;
  // disabling unrolling here saves some bytes on the binary
  #pragma nounroll
  while(len--) {
    // 2x shift variant (faster than shuffle on wasm simd)
    const __m128i v0 = _mm_loadu_si128((__m128i*) src);
    const __m128i v1 = _mm_loadu_si128((__m128i*) (src + 16));
    const __m128i pack = _mm_packus_epi16(
      _mm_srli_epi16(v0, 8),
      _mm_srli_epi16(v1, 8)
    );
    _mm_storeu_si128((__m128i*) dst, pack);
    dst += 16;
    src += 32;
  }
  // FIXME: implement tail handling
  return dst - TARGET;
}
`
})();


const convert_scalar = InWasm({
  name: 'convert',
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  compile: {
    defines: { CHUNK_SIZE: SETTINGS.chunkSize },
    switches: ['-s TOTAL_STACK=0', '-s IMPORTED_MEMORY=1']
  },
  imports: importObj,
  exports: {
    chunk_addr: () => 0,
    target_addr: () => 0,
    convert: (length: number) => 0,
    //memory: new WebAssembly.Memory({initial: 1, maximum: 1})
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
})();


/**
 * create sync instance at runtime at top level (loading phase)
 * Important note: Sync is safely possible here, since the created wasm modules are rather small.
 *                 For bigger wasm modules always resort to async in browser main context.
 */
const WAE = WebAssembly as typeof WebAssemblyExtended;
const m = WAE.validate(convert_simd)
  ? new WAE.Module(convert_simd)
  : new WAE.Module(convert_scalar);
//const instance = new WAE.Instance(m); //, {env});
const instance = new WAE.Instance(m, importObj);

// memory access
//const mem = env.memory.buffer; //instance.exports.memory.buffer; //env.memory.buffer;
const mem = importObj.env.memory.buffer;
const CHUNK = new Uint8Array(mem, instance.exports.chunk_addr(), SETTINGS.chunkSize);
const TARGET = new Uint8Array(mem, instance.exports.target_addr(), SETTINGS.chunkSize / 2);


/**
 * Exported function to be used from elsewhere.
 * The conversion is done chunkwise in wasm up to SETTINGS.chunkSize.
 */
export function convert16BitTo8BitData(data: Uint16Array, target?: Uint8Array): Uint8Array {
  const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const end = data.byteLength;
  const result = target || new Uint8Array(end / 2);
  let p = 0;
  let offset = 0;
  while (p < end) {
    const length = Math.min(end - p, SETTINGS.chunkSize);
    CHUNK.set(view.subarray(p, p += length));
    const rlen = instance.exports.convert(length);
    result.set(TARGET.subarray(0, rlen), offset);
    offset += rlen;
  }
  return new Uint8Array(result.buffer, 0, data.length);
}

// basic inplace test
// FIXME: to be removed by test cases
console.log(
  convert16BitTo8BitData(new Uint16Array([
    0x1122, 0x3344, 0x5566, 0x7788, 0x1122, 0x3344, 0x5566, 0x7788,
    0x1122, 0x3344, 0x5566, 0x7788, 0x1122, 0x3344, 0x5566, 0x7788
  ]))
);
console.log('memory bytelength:', mem.byteLength);

