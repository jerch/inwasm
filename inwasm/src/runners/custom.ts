import { IMemorySettings, IWasmDefinition } from '..';


export default async function(def: IWasmDefinition, buildDir: string, filename: string, memorySettings: IMemorySettings): Promise<Uint8Array> {
  if (def.customRunner)
      return await def.customRunner(def, buildDir, filename, memorySettings);
    throw new Error('no customRunner defined');
}
