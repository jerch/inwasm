import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { IWasmDefinition } from '..';
import { APP_ROOT } from '../config';


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
  console.log(`\n[rust.run] cargo build --target wasm32-unknown-unknown --release`);
  execSync(`cargo build --target wasm32-unknown-unknown --release`, { shell: '/bin/bash', stdio: 'inherit' });
  const wasmStrip = path.join(APP_ROOT, 'node_modules/wabt/bin/wasm-strip');
  console.log(`\n[rust.run] ${wasmStrip} ${target}`);
  execSync(`${wasmStrip} ${target}`, { shell: '/bin/bash', stdio: 'inherit' });
  return fs.readFileSync(target);
}
