import { IMemorySettings, IWasmDefinition } from '..';


export default function(def: IWasmDefinition, buildDir: string, filename: string, memorySettings: IMemorySettings): Uint8Array {
  if (def.customRunner)
      return def.customRunner(def, buildDir, filename, memorySettings);
    throw new Error('no customRunner defined');
}
