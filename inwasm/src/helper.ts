import * as fs from 'fs';
import { IWasmDefinition } from '.';


export function rmFolder(p: string) {
  try {
    fs[process.version > 'v15' ? 'rmSync' : 'rmdirSync'](p, { recursive: true });
  } catch (e) {}
}


function deriveMemoryDescriptor(mem: WebAssembly.Memory): WebAssembly.MemoryDescriptor {
  const initial = mem.buffer.byteLength / 65536;
  // test for unset maximum
  let maximum: number | undefined = undefined;
  try {
    mem.grow(65536 - initial);
  } catch (e) {
    let grows = 0;
    while (true) {
      try {
        mem.grow(1);
        grows++;
      } catch (e) {
        break;
      }
    }
    maximum = grows + initial;
  }
  // Note: node 14 cannot correctly spot SAB usage here!
  const shared = mem.buffer instanceof SharedArrayBuffer ? true : false;
  return {initial, maximum, shared};
}


function getExportMemoryDescriptor(def: IWasmDefinition): WebAssembly.MemoryDescriptor {
  const mem = def.exports.memory as WebAssembly.Memory;
  const descriptor = deriveMemoryDescriptor(mem);
  def.exports.memory = new WebAssembly.Memory(descriptor);
  return descriptor;
}


function getImportMemoryDescriptor(def: IWasmDefinition): WebAssembly.MemoryDescriptor {
  const mem = def.imports!.env.memory as WebAssembly.Memory;
  const descriptor = deriveMemoryDescriptor(mem);
  def.imports!.env.memory = new WebAssembly.Memory(descriptor);
  return descriptor;
}


interface IMemorySettings {
  /**
   * Memory descriptor as derived from the wasm definition.
   * Might be undefined in case, no memory directive was found in wasm definition.
   * Not using any memory directive is discouraged, as it has several drawbacks:
   * - real allocated memory at runtime is compiler dependent (undefined behavior for inwasm)
   * - memory tends to be much bigger than really needed (runtime penalty)
   * - memory is still exposed in exports, but not properly typed anymore 
   */
  descriptor?: WebAssembly.MemoryDescriptor;
  /** Whether the memory is imported or exported. */
  mode: 'imported' | 'exported';
}

export function extractMemorySettings(def: IWasmDefinition): IMemorySettings {
  if (def.exports.memory && def.imports?.env.memory) {
    throw new Error('memory may not be exported and imported at once');
  }
  if (def.imports?.env.memory) {
    const descriptor = getImportMemoryDescriptor(def);
    return { descriptor, mode: 'imported' }
  }
  if (def.exports.memory) {
    const descriptor = getExportMemoryDescriptor(def);
    return { descriptor, mode: 'exported' } 
  }
  // default is exported memory as set by compiler defaults
  return {
    descriptor: undefined,
    mode: 'exported'
  }
}
