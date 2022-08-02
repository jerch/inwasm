import { InWasm, OutputMode, OutputType } from 'inwasm';


export const doubled = InWasm({
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


// basic test
console.log('rust doubled 66:', doubled.exports.doubled(66));
console.log('rust doubled -333:', doubled.exports.doubled(-333));
console.log('memory bytelength:', (doubled.exports as any).memory.buffer.byteLength);