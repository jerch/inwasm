import { InWasm, OutputMode, OutputType } from 'inwasm';


export const wat_adder = InWasm({
  name: 'from_wat',
  type: OutputType.INSTANCE,
  mode: OutputMode.SYNC,
  srctype: 'wat',
  exports: {
    add: (a: number, b: number) => 0
  },
  code: `
  (module
    (func (export "add") (param $n1 i32) (param $n2 i32) (result i32)
      local.get $n1
      local.get $n2
      i32.add))
    `
})();

// basic test
console.log('from wat:', wat_adder.exports.add(23, 42));
