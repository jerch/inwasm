import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { getZigBinary } from '../sdks/zig';
import { IWasmDefinition } from '..';
import { APP_ROOT } from '../config';


export default function(def: IWasmDefinition, buildDir: string): Uint8Array {
  const wd = process.cwd();
  process.chdir(buildDir);
  const src = `${def.name}.zig`;
  const target = `${def.name}.wasm`;
  fs.writeFileSync(src, def.code);
  const ff = Object.entries(def.exports)
    .filter(el => typeof el[1] === 'function' || el[1] instanceof WebAssembly.Global)
    .map(el => `--export=${el[0]}`)
    .join(' ');
  const zig = getZigBinary();
  const call = `${zig} build-lib ${src} -target wasm32-freestanding -dynamic -O ReleaseFast ${ff}`;
  console.log(`\n[zig.run] ${call}`);
  execSync(call, { shell: '/bin/bash', stdio: 'inherit' });
  const wasmStrip = path.join(APP_ROOT, 'node_modules/wabt/bin/wasm-strip');
  console.log(`\n[zig.run] ${wasmStrip} ${target}`);
  execSync(`${wasmStrip} ${target}`, { shell: '/bin/bash', stdio: 'inherit' });
  return fs.readFileSync(target);
}
