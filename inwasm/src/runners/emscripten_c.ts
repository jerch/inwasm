import * as fs from 'fs';
import { emscriptenRun } from '../sdks/emscripten';
import { IWasmDefinition } from '..';
import { extractMemorySettings } from '../helper';


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
  
  // memory settings
  const memorySettings = extractMemorySettings(def);
  if (memorySettings.descriptor) {
    if (memorySettings.descriptor.initial !== undefined) {
      add_switches += ` -s INITIAL_MEMORY=${memorySettings.descriptor.initial * 65536}`;
    }
    if (memorySettings.descriptor.maximum !== undefined) {
      if (memorySettings.descriptor.initial !== memorySettings.descriptor.maximum) {
        add_switches += ` -s MAXIMUM_MEMORY=${memorySettings.descriptor.maximum * 65536}`;
        add_switches += ` -s ALLOW_MEMORY_GROWTH=1`;
      }
    }
  }
  if (memorySettings.mode === 'imported') {
    add_switches += ' -s IMPORTED_MEMORY=1';
  }

  const switches = `-s ERROR_ON_UNDEFINED_SYMBOLS=0 -s WARN_ON_UNDEFINED_SYMBOLS=0 ` + add_switches;
  const funcs = `-s EXPORTED_FUNCTIONS='[${_funcs}]'`;
  const call = `emcc ${opt} ${defines} ${funcs} ${switches} --no-entry ${src} -o ${target}`;
  emscriptenRun(call);
  return fs.readFileSync(target);
}
