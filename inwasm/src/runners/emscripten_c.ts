import * as fs from 'fs';
import { emscriptenRun } from '../sdks/emscripten';
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
  const _funcs = Object.entries(def.exports)
    .filter(el => typeof el[1] === 'function')
    .map(el => `"_${el[0]}"`)
    .join(',');
  let add_switches = '';
  if (def.compile && def.compile.switches) {
    add_switches = def.compile.switches.join(' ');
  }
  const switches = `-s ERROR_ON_UNDEFINED_SYMBOLS=0 -s WARN_ON_UNDEFINED_SYMBOLS=0 ` + add_switches;
  const funcs = `-s EXPORTED_FUNCTIONS='[${_funcs}]'`;
  const call = `emcc ${opt} ${defines} ${funcs} ${switches} --no-entry ${src} -o ${target}`;
  emscriptenRun(call);
  return fs.readFileSync(target);
}
