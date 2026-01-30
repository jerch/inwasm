import { InWasm, OutputMode, OutputType } from 'inwasm';


export const fibonacci = InWasm({
  name: 'fibonacci',
  type: OutputType.INSTANCE,
  mode: OutputMode.SYNC,
  srctype: 'Zig',
  //imports: importObject,
  exports: {
    fibonacci: (index: number) => 0,
    memory: new WebAssembly.Memory({initial: 0, maximum: 0})
  },
  compile: {
    switches: ['--stack 0']
  },
  code: `
  export fn fibonacci(index: u32) u32 {
    if (index < 2) return index;
    return fibonacci(index - 1) + fibonacci(index - 2);
  }
  `
})();


// basic test
console.log('fibonacci zig 5:', fibonacci.exports.fibonacci(5));
console.log('fibonacci zig 20:', fibonacci.exports.fibonacci(20));
console.log('memory bytelength:', fibonacci.exports.memory.buffer.byteLength);
