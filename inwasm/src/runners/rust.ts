import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { IMemorySettings, IWasmDefinition } from '../index.js';
import { SHELL, WABT_TOOL } from '../config.js';
import { rmFolder } from '../helper.js';


export default function(def: IWasmDefinition, buildDir: string, filename: string, memorySettings: IMemorySettings): Uint8Array {
  const wd = process.cwd();
  execSync(`cargo version`, { shell: SHELL });
  rmFolder(buildDir);
  process.chdir(path.dirname(buildDir));
  const src = path.join(buildDir, 'src', 'lib.rs');
  const target = path.join(buildDir, 'target', 'wasm32-unknown-unknown', 'release', `${def.name}.wasm`);
  console.log(`\n[rust.run] cargo new ${def.name} --lib`);
  execSync(`cargo new ${def.name} --lib`, { shell: SHELL, stdio: 'inherit' });
  process.chdir(buildDir);
  fs.writeFileSync(src, def.code);
  fs.appendFileSync('Cargo.toml', '\n[lib]\ncrate-type = ["cdylib"]\n[profile.release]\nlto = true\n');
  let switches: string[] = [];

  // memory settings
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
  execSync(call, { shell: SHELL, stdio: 'inherit' });
  console.log(`\n[rust.run] wasm-strip ${target}`);
  execSync(`${WABT_TOOL['wasm-strip']} "${target}"`, { shell: SHELL, stdio: 'inherit' });
  return fs.readFileSync(target);
}
