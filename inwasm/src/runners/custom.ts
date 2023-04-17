import { IMemorySettings, IWasmDefinition } from '..';


export default async function(def: IWasmDefinition, buildDir: string, filename: string, memorySettings: IMemorySettings): Promise<Uint8Array> {
  // assume noCache by default for custom runners
  if (def.noCache === undefined) {
    def.noCache = true;
  }
  if (def.customRunner) {
    return await def.customRunner(def, buildDir, filename, memorySettings);
  }
  throw new Error('no customRunner defined');
}
