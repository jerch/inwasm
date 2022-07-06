import { EmWasmInstance } from './emwasm/definitions';


const unit = EmWasmInstance( /* ##EMWASM## */ {
  name: 'unit',
  mode: 'sync',
  srctype: 'C',
  compile: {
    defines: {CHUNK_SIZE: 4096}
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
} /* ##\EMWASM## */ );


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


// with imported functions
const env = {jsadd: (a: number, b: number) => a + b}


export const second = EmWasmInstance(
  // ##EMWASM##
  {
    name: 'second',
    mode: 'async',
    srctype: 'C',
    imports: 'env',
    exports: {
      add: (a: number, b: number) => 0
    },
    code: `
    // forward decl w'o real impl (marked for import by emscripten)
    int jsadd(int a, int b);

    // some silly function
    int add(int a, int b) {
      return jsadd(a, b);
    }
    `
  }
  // ##\EMWASM##
);

async function bla() {
  const s = await second;
  console.log(s);
  console.log((await second).exports.add(11, 22));
}
bla();

