#!/usr/bin/env node

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { TDefinition, TGenerate, _IEmWasmCtx } from './definitions';


interface IWasmSourceDefinition {
  definition: TDefinition;
  generate: TGenerate;
  stack: string;
}

interface IWasmBlock {
  start: number;
  end: number;
}

class EmWasmReadExit extends Error {}

let units: IWasmSourceDefinition[] = [];

(global as any)._emwasmCtx = {
  addUnit: (definition, generate) => {
    if (!definition.name) return;
    units.push({definition, generate, stack: ''});
    // stop further loading
    throw new EmWasmReadExit('exit');
  }
} as _IEmWasmCtx;


function parseFileContent(content: string, filename: string): IWasmBlock[] {
  const starts: number[] = [];
  const ends: number[] = [];
  let idx = -1;
  while (true) {
    idx = content.indexOf('##EMWASM##', idx+1);
    if (idx === -1) break;
    starts.push(idx);
  }
  idx = -1;
  while (true) {
    idx = content.indexOf('##\\EMWASM##', idx+1);
    if (idx === -1) break;
    ends.push(idx);
  }
  // check for unmatched/nested
  if (starts.length !== ends.length) throw new Error(`in '${filename}' - unmatched ##EMWASM## tokens`);
  const values: number[] = [];
  for (let i = 0; i < starts.length; ++i) {
    values.push(starts[i]);
    values.push(ends[i]);
  }
  for (let i = 0; i < values.length - 1; ++i) {
    if (values[i] > values[i + 1]) {
      throw new Error(`in '${filename}' - ##EMWASM tokens may not overlap`);
    }
  }
  // find cut borders
  for (let i = 0; i < starts.length; ++i) {
    const idxSingle = content.lastIndexOf('//', starts[i]);
    const idxMulti = content.lastIndexOf('/*', starts[i]);
    const realStart = Math.max(idxSingle, idxMulti);
    if (!content.slice(realStart, starts[i]).match(/^\/(\/\s*)|([*]+\s*)$/)) {
      throw new Error(`in '${filename}' - cannot parse ##EMWASM## token at ${starts[i]}`);
    }
    starts[i] = realStart;
  }
  for (let i = 0; i < ends.length; ++i) {
    const idxSingle = content.lastIndexOf('//', ends[i]);
    const idxMulti = content.lastIndexOf('/*', ends[i]);
    const realStart = Math.max(idxSingle, idxMulti);
    if (!content.slice(realStart, ends[i]).match(/^\/(\/\s*)|([*]+\s*)$/)) {
      throw new Error(`in '${filename}' - cannot parse ##\EMWASM## token at ${ends[i]}`);
    }
    let realEnd = -1;
    if (realStart === idxSingle ) {
      // single line, search for \n through end of data
      realEnd = content.indexOf('\n', realStart);
      if (realEnd === -1) realEnd = content.length;
      if (!content.slice(ends[i], realEnd).match(/##\\EMWASM##\s*/)) {
        throw new Error(`in '${filename}' - cannot parse ##\EMWASM## token at ${ends[i]}`);
      }
    } else {
      // multi line
      realEnd = content.indexOf('*/', realStart);
      if (realEnd === -1 || !content.slice(ends[i], realEnd).match(/##\\EMWASM##\s*/)) {
        throw new Error(`in '${filename}' - cannot parse ##\EMWASM## token at ${ends[i]}`);
      }
      realEnd += 2;
    }
    ends[i] = realEnd;
  }
  const blocks: {start: number, end: number}[] = [];
  for (let i = 0; i < starts.length; ++i) {
    blocks.push({start: starts[i], end: ends[i]});
  }
  return blocks;
}


function identifyBlock(wdef: IWasmSourceDefinition, blocks: IWasmBlock[], filename: string, content: string): number {
  // walk call stack to find matching wasm block
  const stack = wdef.stack.split('\n');
  if (!stack.length) throw new Error('cannot work with empty stack');
  for (let i = 0; i < stack.length; ++i) {
    const idx = stack[i].indexOf(filename);
    if (idx !== -1) {
      const m = stack[i].slice(idx + filename.length).match(/.*?(\d+):(\d+).*?/);
      if (!m) throw new Error('error parsing stack positions');
      const lineNum = parseInt(m[1]);
      const charPos = parseInt(m[2]);
      if (isNaN(lineNum) || isNaN(charPos)) throw new Error('error parsing stack positions');

      // find closest block
      let idxNl = -1;
      for (let k = 0; k < lineNum - 1; ++k) {
        idxNl = content.indexOf('\n', idxNl + 1);
        if (idxNl == -1) throw new Error('error parsing line positions from stack values');
      }
      const stackPos = idxNl + charPos;
      let blockId = -1;
      let distance = Number.MAX_SAFE_INTEGER;
      for (let k = 0; k < blocks.length; ++k) {
        if (blocks[k].start < stackPos) continue;
        if (blocks[k].start - stackPos < distance) {
          blockId = k;
          distance = blocks[k].start - stackPos;
        }
      }
      if (blockId === -1) throw new Error('error finding wasm block close to stack position');

      // sanity check: generate should match function name infront of wasm block
      const instIdx = content.lastIndexOf('EmWasmInstance', blocks[blockId].start);
      const modIdx = content.lastIndexOf('EmWasmModule', blocks[blockId].start);
      const bytesIdx = content.lastIndexOf('EmWasmBytes', blocks[blockId].start);
      if (instIdx === -1 && modIdx === -1 && bytesIdx === -1) throw new Error('cannot dermine generate type');
      const highestIdx = Math.max(instIdx, modIdx, bytesIdx);
      const generate = highestIdx === instIdx ? 'instance'
        : highestIdx === modIdx ? 'module'
        : 'bytes';
      if (generate !== wdef.generate) throw new Error('mismatch in generate types');
      return blockId;
    }
  }
  throw new Error('error finding matching wasm block');
}


function compileEmscripten(definition: TDefinition): Buffer {
  // FIXME: needs major overhaul:
  //  - eg. do compilation in local folder to preserve wasm files
  //  - name wasm files from unit name
  //  - multiple feature sets?
  //  - map all relevant compile settings
  //  - generate a warning, if sync=true and wasm size > 4096
  let result;
  const wd = process.cwd();
  let tmpDir;
  const appPrefix = 'em-wasm_';
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), appPrefix));
    process.chdir(tmpDir);
    const sdk = `source ${wd}/emsdk/emsdk_env.sh > /dev/null 2>&1`;
    const src = 'src.c';
    const target = 'src.wasm';
    const opt = `-O3`;
    fs.writeFileSync(src, definition.code);
    const defines = Object.entries(definition.compile?.defines || {})
      .map(el => `-D${el[0]}=${el[1]}`).join(' ');
    const _funcs = Object.entries(definition.exports)
      .filter(el => typeof el[1] === 'function')
      .map(el => `"_${el[0]}"`)
      .join(',');
    const switches = `-s ERROR_ON_UNDEFINED_SYMBOLS=0 -s WARN_ON_UNDEFINED_SYMBOLS=0`;
    const funcs = `-s EXPORTED_FUNCTIONS='[${_funcs}]'`;
    const call = `${sdk} && emcc ${opt} ${defines} ${funcs} ${switches} --no-entry ${src} -o ${target}`;
    console.log(call);
    execSync(call, {shell: '/bin/bash'});
    result = fs.readFileSync(target);
  } catch (e) {
    console.log(e);
  }
  finally {
    try {
      if (tmpDir) fs.rmSync(tmpDir, {recursive: true});
    } catch (e) {}
  }
  process.chdir(wd);
  if (!result) throw new Error('compile error');
  return result;
}


function createCompiledBlock(wasm: Buffer, wdef: IWasmSourceDefinition): string {
  const defines = [];
  for (const [k, v] of Object.entries(wdef.definition.compile?.defines || {})) {
    if (typeof v === 'number') {
      defines.push(`${k}: ${v}`);
    } else if (typeof v === 'string') {
      defines.push(`${k}: '${v}'`);
    }
  }
  const parts: string[] = [];
  if (defines.length) parts.push(`defines:{${defines.join(',')}}`);
  if (wdef.definition.imports) parts.push('env:' + wdef.definition.imports);
  parts.push(`sync:${wdef.definition.mode === 'sync' ? 1 : 0}`);
  parts.push(`data:'${wasm.toString('base64')}'`);
  return `{${parts.join(',')}}`;
}


function loadModule(filename: string) {
  units.length = 0;
  try {
    // FIXME: needs ES6 patch
    const modulePath = path.resolve(filename);
    delete require.cache[require.resolve(modulePath)];
    require(modulePath);
  } catch (e) {
    if (!(e instanceof EmWasmReadExit)) {
      console.log('error during require:', e);
      return;
    }
    if (units.length !== 1) throw new Error("did not find a single description");
    units[0].stack = e.stack || '';
  }
}


function main() {
  for (const filename of process.argv.slice(2)) {
    let content = fs.readFileSync(filename, {encoding: 'utf-8'});
    let blocks = parseFileContent(content, filename);
    if (!blocks.length) continue;
    console.log(`${blocks.length} wasm code blocks found in ${filename}`);

    // should only load one description a time
    while (blocks.length) {
      loadModule(filename);
      const wdef = units[0];
      if (!wdef) {
        console.warn('Warning: ##EMWASM## block without call to EmWasm** found, skipping');
        break;
      }
      const blockId = identifyBlock(wdef, blocks, filename, content);
      const block = blocks[blockId];
      console.log(`\n'${wdef.definition.name}' at ${filename}, offset [${block.start},${block.end}]:\n`);

      // compile & create new block
      const wasm = compileEmscripten(wdef.definition);
      const blockReplace = createCompiledBlock(wasm, wdef);

      const final: string[] = [content.slice(0, block.start), blockReplace, content.slice(block.end)];
      fs.writeFileSync(filename, final.join(''));
      content = fs.readFileSync(filename, {encoding: 'utf-8'});
      blocks = parseFileContent(content, filename);
    }
  }
}

main();
