import * as assert from 'assert';
import * as path from 'path';
import { InWasm, OutputMode, OutputType } from 'inwasm';
import { applyMochaShim } from 'inwasm/lib/mocha_shim';
import { watExportMemory, watImportMemory } from './testhelper';


// load dirty mocha shims
applyMochaShim();


const MEM_PAGE = 65536;
const WAT_PATH = path.join('inwasm-builds', 'lib', 'tests', 'rust.test.wasm.js');


describe('rust', () => {
  describe('memory', () => {
    it('export {initial: 1}', () => {
      const UNIT = 'memory_export1';
      const inst = InWasm({
        name: UNIT,
        type: OutputType.INSTANCE,
        mode: OutputMode.SYNC,
        srctype: 'Rust',
        compile: {
          switches: ['-Clink-args="-z stack-size=0"']
        },
        exports: {
          memory: new WebAssembly.Memory({ initial: 1 })
        },
        code: ``
      })();
      assert.strictEqual(inst.exports.memory.buffer.byteLength, 1 * MEM_PAGE);
      assert.strictEqual(watExportMemory(WAT_PATH, UNIT), '(memory (;0;) 1)');
    });
    it('export {initial: 1, maximum: 1}', () => {
      const UNIT = 'memory_export2';
      const inst = InWasm({
        name: UNIT,
        type: OutputType.INSTANCE,
        mode: OutputMode.SYNC,
        srctype: 'Rust',
        compile: {
          switches: ['-Clink-args="-z stack-size=0"']
        },
        exports: {
          memory: new WebAssembly.Memory({ initial: 1, maximum: 1 })
        },
        code: ``
      })();
      assert.strictEqual(inst.exports.memory.buffer.byteLength, 1 * MEM_PAGE);
      assert.strictEqual(watExportMemory(WAT_PATH, UNIT), '(memory (;0;) 1 1)');
    });
    it('export {initial: 2, maximum: 20}', () => {
      const UNIT = 'memory_export3';
      const inst = InWasm({
        name: UNIT,
        type: OutputType.INSTANCE,
        mode: OutputMode.SYNC,
        srctype: 'Rust',
        compile: {
          switches: ['-Clink-args="-z stack-size=0"']
        },
        exports: {
          memory: new WebAssembly.Memory({ initial: 2, maximum: 20 })
        },
        code: ``
      })();
      assert.strictEqual(inst.exports.memory.buffer.byteLength, 2 * MEM_PAGE);
      assert.strictEqual(watExportMemory(WAT_PATH, UNIT), '(memory (;0;) 2 20)');
    });
    it('import {initial: 1}', () => {
      const UNIT = 'memory_import1';
      const importObj = { env: { memory: new WebAssembly.Memory({ initial: 1 }) } };
      const inst = InWasm({
        name: UNIT,
        type: OutputType.INSTANCE,
        mode: OutputMode.SYNC,
        srctype: 'Rust',
        compile: {
          switches: ['-Clink-args="-z stack-size=0"']
        },
        imports: importObj,
        exports: {
          store: (pos: number, value: number) => undefined,
          load: (pos: number) => 0
        },
        code: `
        static mut SOME_STATIC: [i32; 10] = [0; 10];
        #[no_mangle]
        pub extern fn store(pos: usize, value: i32) {
          match pos {
            0..=9 => unsafe { SOME_STATIC[pos] = value; },
            _ => (),
          }
        }
        #[no_mangle]
        pub extern fn load(pos: usize) -> i32 {
          match pos {
            0..=9 => unsafe { SOME_STATIC[pos] },
            _ => 0,
          }
        }
        `
      })(importObj);
      assert.strictEqual(watImportMemory(WAT_PATH, UNIT), '(import "env" "memory" (memory (;0;) 1))');
      inst.exports.store(5, -55)
      assert.strictEqual(inst.exports.load(5), -55);
    });
    it('import {initial: 2, maximum: 20}', () => {
      const UNIT = 'memory_import2';
      const importObj = { env: { memory: new WebAssembly.Memory({ initial: 2, maximum: 20 }) } };
      const inst = InWasm({
        name: UNIT,
        type: OutputType.INSTANCE,
        mode: OutputMode.SYNC,
        srctype: 'Rust',
        compile: {
          switches: ['-Clink-args="-z stack-size=0"']
        },
        imports: importObj,
        exports: {
          store: (pos: number, value: number) => 0,
          load: (pos: number) => 0
        },
        code: `
        static mut SOME_STATIC: [i32; 10] = [0; 10];
        #[no_mangle]
        pub extern fn store(pos: usize, value: i32) {
          match pos {
            0..=9 => unsafe { SOME_STATIC[pos] = value; },
            _ => (),
          }
        }
        #[no_mangle]
        pub extern fn load(pos: usize) -> i32 {
          match pos {
            0..=9 => unsafe { SOME_STATIC[pos] },
            _ => 0,
          }
        }
        `
      })(importObj);
      assert.strictEqual(watImportMemory(WAT_PATH, UNIT), '(import "env" "memory" (memory (;0;) 2 20))');
      inst.exports.store(5, -55);
      assert.strictEqual(inst.exports.load(5), -55);
    });
  });
});
