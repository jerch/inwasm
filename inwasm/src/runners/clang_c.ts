import * as fs from 'fs';
import * as path from 'path';
import { emscriptenRun, getClangBinPath } from '../sdks/emscripten';
import { IWasmDefinition } from '..';


export default function(def: IWasmDefinition, buildDir: string): Uint8Array {
  // TODO: copy additional files
  process.chdir(buildDir);
  const src = `${def.name}.c`;
  const target = `${def.name}.wasm`;
  fs.writeFileSync(src, def.code);
  // TODO: apply compile options properly
  const opt = `-O3`;
  const defines = Object.entries(def.compile?.defines || {})
    .map(el => `-D${el[0]}=${el[1]}`).join(' ');
  let add_switches = '';
  if (def.compile && def.compile.switches) {
    add_switches = def.compile.switches.join(' ');
  }
  const ff = Object.entries(def.exports)
    .filter(el => typeof el[1] === 'function' || el[1] instanceof WebAssembly.Global)
    .map(el => `--export=${el[0]}`)
    .join(',');
  const clang = path.join(getClangBinPath(), 'clang');
  const call = `${clang} --target=wasm32-unknown-unknown --no-standard-libraries -Wl,${ff} -Wl,--no-entry -Wl,--lto-O3 ${opt} -flto ${defines} -o ${target} ${src}`;
  emscriptenRun(call);
  return fs.readFileSync(target);
}
