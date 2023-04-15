import * as fs from 'fs';
import { execSync } from 'child_process';
import { IMemorySettings, IWasmDefinition } from '..';
import { SHELL, WABT_TOOL } from '../config';


export default function(def: IWasmDefinition, buildDir: string, filename: string, memorySettings: IMemorySettings): Uint8Array {
  const wd = process.cwd();
  process.chdir(buildDir);
  const src = `${def.name}.wat`;
  const target = `${def.name}.wasm`;
  fs.writeFileSync(src, def.code);
  const call = `${WABT_TOOL.wat2wasm} ${src} && ${WABT_TOOL['wasm-strip']} ${target}`;
  execSync(call, { shell: SHELL, stdio: 'inherit' });
  return fs.readFileSync(target);
}
