import { InWasm, OutputMode, OutputType, WebAssemblyExtended } from 'inwasm';


const SETTINGS = {
  chunkSize: 16384
} as const;


const convert = (() => {
  try {
    return InWasm({
      name: 'convert-simd',
      type: OutputType.INSTANCE,
      mode: OutputMode.SYNC,
      srctype: 'C',
      compile: {
        defines: { CHUNK_SIZE: SETTINGS.chunkSize },
        switches: ['-msimd128', '-msse', '-msse2', '-mssse3', '-msse4.1']
      },
      exports: {
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

  #include <immintrin.h>
  int convert(int length) {
    unsigned char *src = CHUNK;
    unsigned char *dst = TARGET;
    int len = length / 32;
    while(len--) {
      // 2x shift variant (faster than shuffle on wasm simd)
      __m128i v0 = _mm_loadu_si128((__m128i*) src);
      __m128i v1 = _mm_loadu_si128((__m128i*) (src + 16));
      v0 = _mm_srli_epi16(v0, 8);
      v1 = _mm_srli_epi16(v1, 8);
      __m128i pack = _mm_packus_epi16(v0, v1);
      _mm_storeu_si128((__m128i*) dst, pack);
      dst += 16;
      src += 32;
    }
    // FIXME: implement tail handling
    return dst - TARGET;
  }
  `
    })();
  } catch (e) {
    return InWasm({
      name: 'convert',
      type: OutputType.INSTANCE,
      mode: OutputMode.SYNC,
      srctype: 'C',
      compile: {
        defines: { CHUNK_SIZE: SETTINGS.chunkSize }
      },
      exports: {
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
    })()
  }
})();


const CHUNK = new Uint8Array(convert.exports.memory.buffer, convert.exports.chunk_addr(), SETTINGS.chunkSize);
const TARGET = new Uint8Array(convert.exports.memory.buffer, convert.exports.target_addr(), SETTINGS.chunkSize / 2);

export function convert16BitTo8BitData(data: Uint16Array, target?: Uint8Array): Uint8Array {
  const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const end = data.byteLength;
  const result = target || new Uint8Array(end / 2);
  let p = 0;
  let offset = 0;
  while (p < end) {
    const length = Math.min(end - p, SETTINGS.chunkSize);
    CHUNK.set(view.subarray(p, p += length));
    const rlen = convert.exports.convert(length);
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


// with imported functions
const env = { jsadd: (a: number, b: number) => a + b }


const second_ = InWasm({
  name: 'second',
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'Clang-C',
  imports: 'env',
  exports: {
    add: (a: number, b: number) => 0
  },
  code: `
    // forward decl w'o real impl (marked for import by emscripten)
    //int jsadd(int a, int b);

    // clang style
    __attribute__((import_module("env"), import_name("jsadd"))) int jsadd(int a, int b);

    // some silly function
    int add(int a, int b) {
      return jsadd(a, b);
    }
    `
});
export const second = second_();


// zig
const fibonacci_zig_ = InWasm({
  name: 'fibonacci',
  type: OutputType.INSTANCE,
  mode: OutputMode.SYNC,
  srctype: 'Zig',
  exports: {
    fibonacci: (index: number) => 0
  },
  code: `
  export fn fibonacci(index: u32) u32 {
    if (index < 2) return index;
    return fibonacci(index - 1) + fibonacci(index - 2);
  }
  `
});
const fibonacci_zig = fibonacci_zig_();
console.log(fibonacci_zig.exports.fibonacci(5));
console.log(fibonacci_zig.exports.fibonacci(20));


// srctype: wat
const from_wat_ = InWasm({
  name: 'from_wat',
  type: OutputType.INSTANCE,
  mode: OutputMode.SYNC,
  srctype: 'wat',
  imports: 'env',
  exports: {
    add: (a: number, b: number) => 0
  },
  code: `
  (module
    (type $t0 (func (param i32 i32) (result i32)))
    (import "env" "jsadd" (func $env.jsadd (type $t0)))
    (func $add (type $t0) (param $p0 i32) (param $p1 i32) (result i32)
      local.get $p0
      local.get $p1
      call $env.jsadd)
    (memory $memory 2)
    (export "memory" (memory 0))
    (export "add" (func $add)))
    `
});
const from_wat = from_wat_();
console.log(from_wat.exports.add(23, 42));

//// totally custom
// commented out: old code deleted
// FIXME: needs different test case...
//const custom = InWasm({
//  name: 'custom',
//  type: OutputType.INSTANCE,
//  mode: OutputMode.SYNC,
//  srctype: 'custom',
//  customRunner: (def, buildDir) => {
//    const cp = require('child_process');
//    const fs = require('fs');
//    cp.execSync('cd wasm && ./build.sh', { shell: '/bin/bash', stdio: 'inherit' });
//    return fs.readFileSync('wasm/convert.wasm');
//  },
//  exports: {
//    chunk_addr: () => 0,
//    target_addr: () => 0,
//    convert: (length: number) => 0
//  },
//  code: ''
//})();
//console.log(custom.exports);


// rust
const rust = InWasm({
  name: 'doubled',
  type: OutputType.INSTANCE,
  mode: OutputMode.SYNC,
  srctype: 'Rust',
  exports: {
    doubled: (a: number) => 0
  },
  code: `
  #[no_mangle]
  pub extern fn doubled(x: i32) -> i32 {
    x * 2
  }
  `
})();
console.log(rust.exports.doubled(66));
console.log(rust.exports.doubled(-333));




// scalar vs. simd convert
const CONVERT_BYTES = {
  SIMD: InWasm({
  name: 'convert-simd2',
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  compile: {
    defines: { CHUNK_SIZE: SETTINGS.chunkSize },
    switches: ['-msimd128', '-msse', '-msse2', '-mssse3', '-msse4.1']
  },
  exports: {
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

#include <immintrin.h>
int convert(int length) {
unsigned char *src = CHUNK;
unsigned char *dst = TARGET;
int len = length / 32;
while(len--) {
  // 2x shift variant (faster than shuffle on wasm simd)
  __m128i v0 = _mm_loadu_si128((__m128i*) src);
  __m128i v1 = _mm_loadu_si128((__m128i*) (src + 16));
  v0 = _mm_srli_epi16(v0, 8);
  v1 = _mm_srli_epi16(v1, 8);
  __m128i pack = _mm_packus_epi16(v0, v1);
  _mm_storeu_si128((__m128i*) dst, pack);
  dst += 16;
  src += 32;
}
// FIXME: implement tail handling
return dst - TARGET;
}
`
})(),
scalar : InWasm({
  name: 'convert2',
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  compile: {
    defines: { CHUNK_SIZE: SETTINGS.chunkSize }
  },
  exports: {
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
})()
};


// with extended WebAssembly types we can rewrite convert SIMD|SCALAR instantiation much nicer:
const WAE = WebAssembly as typeof WebAssemblyExtended;

// sync
const m = WAE.validate(CONVERT_BYTES.SIMD)
  ? new WAE.Module(CONVERT_BYTES.SIMD)
  : new WAE.Module(CONVERT_BYTES.scalar);
const i = new WAE.Instance(m);

// async
const mp = WAE.instantiate(
  WAE.validate(CONVERT_BYTES.SIMD) ? CONVERT_BYTES.SIMD : CONVERT_BYTES.scalar
);
