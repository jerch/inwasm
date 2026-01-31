/**
 * Copyright (c) 2022, 2026 Joerg Breitbart
 * @license MIT
 */

import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import type { IMemorySettings, IWasmDefinition } from '../index.js';
import { SHELL, WABT_TOOL } from '../config.js';


export default function(def: IWasmDefinition, buildDir: string, filename: string, memorySettings: IMemorySettings): Uint8Array {
  const wd = process.cwd();
  process.chdir(buildDir);
  const src = `${def.name}.wat`;
  const target = `${def.name}.wasm`;
  fs.writeFileSync(src, def.code);
  const call = `${WABT_TOOL.wat2wasm} ${src}`;
  console.log(`\n[wat.run] ${call}`);
  execSync(call, { shell: SHELL, stdio: 'inherit' });
  console.log(`\n[wat.run] wasm-strip ${target}`);
  execSync(`${WABT_TOOL['wasm-strip']} "${target}"`, { shell: SHELL, stdio: 'inherit' });
  return fs.readFileSync(target);
}
