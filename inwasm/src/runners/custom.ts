/**
 * Copyright (c) 2022, 2026 Joerg Breitbart
 * @license MIT
 */

import type { IMemorySettings, IWasmDefinition } from '../index.js';


export default async function(def: IWasmDefinition, buildDir: string, filename: string, memorySettings: IMemorySettings): Promise<Uint8Array> {
  if (def.customRunner) {
    return await def.customRunner(def, buildDir, filename, memorySettings);
  }
  throw new Error('no customRunner defined');
}
