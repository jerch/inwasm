import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { IWasmDefinition } from '..';
import { APP_ROOT } from '../config';
import { extractMemorySettings } from '../helper';


export default function(def: IWasmDefinition, buildDir: string): Uint8Array {
  // NOTE: expects to have a valid cargo installation in PATH!!
  const wd = process.cwd();
  execSync(`cargo version`, { shell: '/bin/bash' });
  fs.rmdirSync(buildDir, { recursive: true });
  process.chdir(path.dirname(buildDir));
  const src = path.join(buildDir, 'src', 'lib.rs');
  const target = path.join(buildDir, 'target', 'wasm32-unknown-unknown', 'release', `${def.name}.wasm`);
  console.log(`\n[rust.run] cargo new ${def.name} --lib`);
  execSync(`cargo new ${def.name} --lib`, { shell: '/bin/bash', stdio: 'inherit' });
  process.chdir(buildDir);
  fs.writeFileSync(src, def.code);
  fs.appendFileSync('Cargo.toml', '\n[lib]\ncrate-type = ["cdylib"]\n[profile.release]\nlto = true\n');

  // FIXME: apply memory settings and fix call mess below
  // memory settings
  const memorySettings = extractMemorySettings(def);
  if (memorySettings.descriptor) {
    if (memorySettings.descriptor.initial !== undefined) {
      
    }
    if (memorySettings.descriptor.maximum !== undefined) {

    }
  }
  if (memorySettings.mode === 'imported') {
    
  }

  console.log(`\n[rust.run] cargo build --target wasm32-unknown-unknown --release`);
  //execSync(`cargo build --target wasm32-unknown-unknown --release`, { shell: '/bin/bash', stdio: 'inherit' });
  execSync(`cargo rustc --target wasm32-unknown-unknown --release -- -Clink-arg=--initial-memory=65536 -Clink-arg=--max-memory=65536 -Clink-args="-z stack-size=0"`, { shell: '/bin/bash', stdio: 'inherit' });
  const wasmStrip = path.join(APP_ROOT, 'node_modules/wabt/bin/wasm-strip');
  console.log(`\n[rust.run] ${wasmStrip} ${target}`);
  execSync(`${wasmStrip} ${target}`, { shell: '/bin/bash', stdio: 'inherit' });
  return fs.readFileSync(target);
}
