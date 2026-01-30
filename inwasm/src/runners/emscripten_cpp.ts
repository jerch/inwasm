import * as fs from 'node:fs';
import * as path from 'node:path';
import { emscriptenRun, getEmscriptenPath } from '../sdks/emscripten.js';
import type { IMemorySettings, IWasmDefinition } from '../index.js';
import { isPosix } from '../config.js';


export default function(def: IWasmDefinition, buildDir: string, filename: string, memorySettings: IMemorySettings): Uint8Array {
  // TODO: copy additional files
  process.chdir(buildDir);
  const src = `${def.name}.cpp`;
  const target = `${def.name}.wasm`;
  fs.writeFileSync(src, def.code);
  // TODO: apply compile options properly
  const opt = `-O3`;
  const defines = Object.entries(def.compile?.defines || {})
    .map(el => `-D${el[0]}=${el[1]}`).join(' ');
  const _funcs = Object.entries(def.exports)
    .filter(el => typeof el[1] === 'function')
    .map(el => `_${el[0]}`)
    .join(',');
  let switches: string[] = [];
  
  // memory settings
  if (memorySettings.descriptor) {
    if (memorySettings.descriptor.initial !== undefined) {
      switches.push(`-s INITIAL_MEMORY=${memorySettings.descriptor.initial * 65536}`);
    }
    if (memorySettings.descriptor.maximum !== undefined) {
      if (memorySettings.descriptor.initial !== memorySettings.descriptor.maximum) {
        switches.push(`-s MAXIMUM_MEMORY=${memorySettings.descriptor.maximum * 65536}`);
        switches.push(`-s ALLOW_MEMORY_GROWTH=1`);
      }
    }
  }
  if (memorySettings.mode === 'imported') {
    switches.push('-s IMPORTED_MEMORY=1');
  }

  // apply custom switches late
  if (def.compile && def.compile.switches) {
    switches.push(...def.compile.switches);
  }

  switches.push(...['-s ERROR_ON_UNDEFINED_SYMBOLS=0', '-s WARN_ON_UNDEFINED_SYMBOLS=0']);

  const funcs = `-s EXPORTED_FUNCTIONS=${_funcs}`;
  // for unknown reason windows shell cannot find emcc, thus give path explicitly
  const bin = isPosix ? 'em++' : path.join(getEmscriptenPath(), 'upstream', 'emscripten', 'em++.bat');
  const call = `${bin} ${opt} ${defines} ${funcs} ${switches.join(' ')} --no-entry ${src} -o ${target}`;
  console.log(`\n[cpp.run] ${call}`);
  emscriptenRun(call);
  return fs.readFileSync(target);
}
