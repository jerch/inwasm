import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { InWasm, OutputMode, OutputType } from 'inwasm';

// FIXME: quickhack around mocha defines
declare let describe: any;
if (typeof describe === 'undefined') {
  (global as any).describe = (s: string, f: Function) => f()
}
declare let it: any;
if (typeof it === 'undefined') {
  (global as any).it = (s: string, f: Function) => f()
}


const MEM_PAGE = 65536;
const WAT_PATH = path.join('inwasm-builds', 'lib', 'clang_c.test.wasm.js');

function watExportMemory(unit: string): string {
  const content = fs.readFileSync(path.join(WAT_PATH, unit, 'final.wat'), {encoding: 'utf-8'});
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('(memory (;')) {
      return trimmed;
    }
  }
  throw new Error('(memory) entry not found in wat');
}
function watImportMemory(unit: string): string {
  const content = fs.readFileSync(path.join(WAT_PATH, unit, 'final.wat'), {encoding: 'utf-8'});
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('(import "env" "memory"')) {
      return trimmed;
    }
  }
  throw new Error('(memory) entry not found in wat');
}


describe('clang-c', () => {
  it('memory export {initial: 1}', () => {
    const UNIT = 'memory_export1';
    const inst = InWasm({
      name: UNIT,
      type: OutputType.INSTANCE,
      mode: OutputMode.SYNC,
      srctype: 'Clang-C',
      compile: {
        switches: ['-Wl,-z,stack-size=0']
      },
      exports: {
        memory: new WebAssembly.Memory({initial: 1})
      },
      code: ``
    })();
    assert.strictEqual(inst.exports.memory.buffer.byteLength, 1 * MEM_PAGE);
    assert.strictEqual(watExportMemory(UNIT), '(memory (;0;) 1)');
  });
  it('memory export {initial: 1, maximum: 1}', () => {
    const UNIT = 'memory_export2';
    const inst = InWasm({
      name: UNIT,
      type: OutputType.INSTANCE,
      mode: OutputMode.SYNC,
      srctype: 'Clang-C',
      compile: {
        switches: ['-Wl,-z,stack-size=0']
      },
      exports: {
        memory: new WebAssembly.Memory({initial: 1, maximum: 1})
      },
      code: ``
    })();
    assert.strictEqual(inst.exports.memory.buffer.byteLength, 1 * MEM_PAGE);
    assert.strictEqual(watExportMemory(UNIT), '(memory (;0;) 1 1)');
  });
  it('memory export {initial: 2, maximum: 20}', () => {
    const UNIT = 'memory_export3';
    const inst = InWasm({
      name: UNIT,
      type: OutputType.INSTANCE,
      mode: OutputMode.SYNC,
      srctype: 'Clang-C',
      compile: {
        switches: ['-Wl,-z,stack-size=0']
      },
      exports: {
        memory: new WebAssembly.Memory({initial: 2, maximum: 20})
      },
      code: ``
    })();
    assert.strictEqual(inst.exports.memory.buffer.byteLength, 2 * MEM_PAGE);
    assert.strictEqual(watExportMemory(UNIT), '(memory (;0;) 2 20)');
  });
  it('memory import {initial: 1}', () => {
    const UNIT = 'memory_import1';
    const importObj = { env: { memory: new WebAssembly.Memory({initial: 1}) } };
    const inst = InWasm({
      name: UNIT,
      type: OutputType.INSTANCE,
      mode: OutputMode.SYNC,
      srctype: 'Clang-C',
      compile: {
        switches: ['-Wl,-z,stack-size=0']
      },
      imports: importObj,
      exports: {
        store: (pos: number, value: number) => 0,
        load: (pos: number) => 0
      },
      code: `
      int SOME_STATIC[10] = {0};
      void store(int pos, int value) {
        SOME_STATIC[pos] = value;
      }
      int load(int pos) {
        return SOME_STATIC[pos];
      }
      `
    })(importObj);
    assert.strictEqual(watImportMemory(UNIT), '(import "env" "memory" (memory (;0;) 1))');
    inst.exports.store(5, -55)
    assert.strictEqual(inst.exports.load(5), -55);
  });
  it('memory import {initial: 2, maximum: 20}', () => {
    const UNIT = 'memory_import2';
    const importObj = { env: { memory: new WebAssembly.Memory({initial: 2, maximum: 20}) } };
    const inst = InWasm({
      name: UNIT,
      type: OutputType.INSTANCE,
      mode: OutputMode.SYNC,
      srctype: 'Clang-C',
      compile: {
        switches: ['-Wl,-z,stack-size=0']
      },
      imports: importObj,
      exports: {
        store: (pos: number, value: number) => 0,
        load: (pos: number) => 0
      },
      code: `
      int SOME_STATIC[10] = {0};
      void store(int pos, int value) {
        SOME_STATIC[pos] = value;
      }
      int load(int pos) {
        return SOME_STATIC[pos];
      }
      `
    })(importObj);
    assert.strictEqual(watImportMemory(UNIT), '(import "env" "memory" (memory (;0;) 2 20))');
    inst.exports.store(5, -55)
    assert.strictEqual(inst.exports.load(5), -55);
  });
});
