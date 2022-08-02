import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { getZigBinary } from '../sdks/zig';
import { IWasmDefinition } from '..';
import { APP_ROOT } from '../config';
import { extractMemorySettings } from '../helper';


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
  
  let add_switches = '';
  if (def.compile && def.compile.switches) {
    add_switches = def.compile.switches.join(' ');
  }

  // memory settings
  const memorySettings = extractMemorySettings(def);
  console.log(memorySettings);
  if (memorySettings.descriptor) {
    if (memorySettings.descriptor.initial !== undefined) {
      add_switches += ` --initial-memory=${memorySettings.descriptor.initial * 65536}`;
    }
    if (memorySettings.descriptor.maximum !== undefined) {
      add_switches += ` --max-memory=${memorySettings.descriptor.maximum * 65536}`;
    }
  }
  if (memorySettings.mode === 'imported') {
    add_switches += ' --import-memory';
  }

  const zig = getZigBinary();
  const call = `${zig} build-lib ${src} -target wasm32-freestanding -dynamic -O ReleaseFast ${ff} ${add_switches}`;
  console.log(`\n[zig.run] ${call}`);
  execSync(call, { shell: '/bin/bash', stdio: 'inherit' });
  const wasmStrip = path.join(APP_ROOT, 'node_modules/wabt/bin/wasm-strip');
  console.log(`\n[zig.run] ${wasmStrip} ${target}`);
  execSync(`${wasmStrip} ${target}`, { shell: '/bin/bash', stdio: 'inherit' });
  return fs.readFileSync(target);
}
