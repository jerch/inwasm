import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { IWasmDefinition } from '..';
import { APP_ROOT } from '../config';
import { extractMemorySettings, rmFolder } from '../helper';


export default function(def: IWasmDefinition, buildDir: string): Uint8Array {
  // NOTE: expects to have a valid cargo installation in PATH!!
  const wd = process.cwd();
  execSync(`cargo version`, { shell: '/bin/bash' });
  rmFolder(buildDir);
  process.chdir(path.dirname(buildDir));
  const src = path.join(buildDir, 'src', 'lib.rs');
  const target = path.join(buildDir, 'target', 'wasm32-unknown-unknown', 'release', `${def.name}.wasm`);
  console.log(`\n[rust.run] cargo new ${def.name} --lib`);
  execSync(`cargo new ${def.name} --lib`, { shell: '/bin/bash', stdio: 'inherit' });
  process.chdir(buildDir);
  fs.writeFileSync(src, def.code);
  fs.appendFileSync('Cargo.toml', '\n[lib]\ncrate-type = ["cdylib"]\n[profile.release]\nlto = true\n');
  let switches: string[] = [];

  // memory settings
  const memorySettings = extractMemorySettings(def);
  if (memorySettings.descriptor) {
    if (memorySettings.descriptor.initial !== undefined) {
      switches.push(`-Clink-arg=--initial-memory=${memorySettings.descriptor.initial * 65536}`);
    }
    if (memorySettings.descriptor.maximum !== undefined) {
      switches.push(`-Clink-arg=--max-memory=${memorySettings.descriptor.maximum * 65536}`);
    }
  }
  if (memorySettings.mode === 'imported') {
    switches.push('-Clink-arg=--import-memory');
  }

  // apply custom switches late
  if (def.compile && def.compile.switches) {
    switches.push(...def.compile.switches);
  }

  // FIXME: make use of cargo build instead of cargo rustc?
  //execSync(`cargo build --target wasm32-unknown-unknown --release`, { shell: '/bin/bash', stdio: 'inherit' });
  const call = `cargo rustc --target wasm32-unknown-unknown --release -- ${switches.join(' ')}`;
  console.log(`\n[rust.run] ${call}`);
  execSync(call, { shell: '/bin/bash', stdio: 'inherit' });
  const wasmStrip = path.join(APP_ROOT, 'node_modules/wabt/bin/wasm-strip');
  console.log(`\n[rust.run] ${wasmStrip} ${target}`);
  execSync(`${wasmStrip} ${target}`, { shell: '/bin/bash', stdio: 'inherit' });
  return fs.readFileSync(target);
}
