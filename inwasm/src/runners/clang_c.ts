import * as fs from 'fs';
import * as path from 'path';
import { emscriptenRun, getClangBinPath } from '../sdks/emscripten';
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
  let switches: string[] = [];

  // memory settings
  const memorySettings = extractMemorySettings(def);
  if (memorySettings.descriptor) {
    if (memorySettings.descriptor.initial !== undefined) {
      switches.push(`-Wl,--initial-memory=${memorySettings.descriptor.initial * 65536}`);
    }
    if (memorySettings.descriptor.maximum !== undefined) {
      switches.push(`-Wl,--max-memory=${memorySettings.descriptor.maximum * 65536}`);
    }
  }
  if (memorySettings.mode === 'imported') {
    switches.push('-Wl,--import-memory');
  }

  // apply custom switches late
  if (def.compile && def.compile.switches) {
    switches.push(...def.compile.switches);
  }

  const ff = Object.entries(def.exports)
    .filter(el => typeof el[1] === 'function' || el[1] instanceof WebAssembly.Global)
    .map(el => `--export=${el[0]}`)
    .join(',');
  const clang = path.join(getClangBinPath(), 'clang');
  const call = `${clang} --target=wasm32-unknown-unknown --no-standard-libraries -Wl,${ff} -Wl,--no-entry -Wl,--lto-O3 ${opt} ${switches.join(' ')} -flto ${defines} -o ${target} ${src}`;
  emscriptenRun(call);
  return fs.readFileSync(target);
}
