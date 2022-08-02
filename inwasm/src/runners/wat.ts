import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { IWasmDefinition } from '..';
import { APP_ROOT } from '../config';


export default function(def: IWasmDefinition, buildDir: string): Uint8Array {
  const wd = process.cwd();
  process.chdir(buildDir);
  const src = `${def.name}.wat`;
  const target = `${def.name}.wasm`;
  fs.writeFileSync(src, def.code);
  const wat2wasm = path.join(APP_ROOT, 'node_modules/wabt/bin/wat2wasm');
  const wasmStrip = path.join(APP_ROOT, 'node_modules/wabt/bin/wasm-strip');
  const call = `${wat2wasm} ${src} && ${wasmStrip} ${target}`;
  execSync(call, { shell: '/bin/bash', stdio: 'inherit' });
  return fs.readFileSync(target);
}
