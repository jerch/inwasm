import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { IMemorySettings, IWasmDefinition } from '..';
import { APP_ROOT, WABT_PATH } from '../config';


export default function(def: IWasmDefinition, buildDir: string, filename: string, memorySettings: IMemorySettings): Uint8Array {
  const wd = process.cwd();
  process.chdir(buildDir);
  const src = `${def.name}.wat`;
  const target = `${def.name}.wasm`;
  fs.writeFileSync(src, def.code);
  const wat2wasm = path.join(WABT_PATH, 'wat2wasm');
  const wasmStrip = path.join(WABT_PATH, 'wasm-strip');
  const call = `node ${wat2wasm} ${src} && node ${wasmStrip} ${target}`;
  execSync(call, { shell: 'cmd.exe', stdio: 'inherit' });
  return fs.readFileSync(target);
}
