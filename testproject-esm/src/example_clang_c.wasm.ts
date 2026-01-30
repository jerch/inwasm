import { InWasm, OutputMode, OutputType } from 'inwasm';


const importObj = {
  env: {
    jsadd: (a: number, b: number) => a + b,
    // force clang to use no memory
    memory: new WebAssembly.Memory({initial: 0, maximum:0})
  }
};


export const adder = InWasm({
  name: 'add',
  type: OutputType.INSTANCE,
  mode: OutputMode.SYNC,
  srctype: 'Clang-C',
  imports: importObj,
  exports: {
    add: (a: number, b: number) => 0,
  },
  compile: {
    switches: ['-Wl,-z,stack-size=0'] // dont use any stack memory
  },
  code: `
    // clang wasm import style
    __attribute__((import_module("env"), import_name("jsadd"))) int jsadd(int a, int b);

    // some silly function w'o any memory interaction
    int add(int a, int b) {
      return jsadd(a, b);
    }
    `
})(importObj);


// basic test
console.log('clang-c add:', adder.exports.add(23, 42));
console.log('memory bytelength:', importObj.env.memory.buffer.byteLength);
