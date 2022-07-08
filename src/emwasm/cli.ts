#!/usr/bin/env node

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { IWasmDefinition, _IEmWasmCtx } from './definitions';

import * as chokidar from 'chokidar';


interface IWasmSourceDefinition {
  definition: IWasmDefinition;
  stack: string;
}


interface IWasmBlock {
  start: number;
  end: number;
}


class EmWasmReadExit extends Error {}


// global var to hold loaded description
let UNITS: IWasmSourceDefinition[] = [];


(global as any)._emwasmCtx = {
  add: (definition) => {
    if (!definition.name) return;
    UNITS.push({definition, stack: ''});
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
      // either no block follows stack position or distance is inacceptable
      if (blockId === -1 || distance > 20) throw new Error('error finding wasm block close to stack position');
      return blockId;
    }
  }
  throw new Error('error finding matching wasm block');
}

/**
 * TODO: compileClang
 *
 * https://lld.llvm.org/WebAssembly.html
 * https://clang.llvm.org/docs/AttributeReference.html
 * https://github.com/schellingb/ClangWasm
 * https://surma.dev/things/c-to-webassembly/
 * https://github.com/jedisct1/libclang_rt.builtins-wasm32.a
 * https://depth-first.com/articles/2019/10/16/compiling-c-to-webassembly-and-running-it-without-emscripten/
 *
 * __attribute__((import_module("env"), import_name("externalFunction"))) void externalFunction(void);
 * __attribute__((export_name(<name>)))
 * __attribute__((import_module(<module_name>)))
 * __attribute__((import_name(<name>)))
 */

/**
 * TODO: support for AS - assemblyscript?
 */

function compileEmscripten(definition: IWasmDefinition): Buffer {
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

    //// clang tests:
    //console.log(definition.exports);
    //const ff = Object.entries(definition.exports)
    //  .filter(el => typeof el[1] === 'function' || el[1] instanceof WebAssembly.Global)
    //  .map(el => `--export=${el[0]}`)
    //  .join(',');
    //console.log(ff);
    ////const symex = definition.name === 'unit' ? '-Wl,--export=CHUNK' : '';
    //const call = `${wd}/../../playground/emsdk/upstream/bin/clang --target=wasm32 --no-standard-libraries -Wl,${ff} -Wl,--no-entry -Wl,--lto-O3 ${opt} -flto ${defines} -o ${target} ${src}`;
    //console.log(call);
    //execSync(call, {shell: '/bin/bash'});

    // FIXME: unset result in case of error
    result = fs.readFileSync(target);
    if (!WebAssembly.validate(result)) throw new Error('wasm file is erroneous');
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
  const parts: string[] = [];
  parts.push(`e:${wdef.definition.imports || 0}`);
  parts.push(`s:${wdef.definition.mode || 0}`);
  parts.push(`t:${wdef.definition.type || 0}`);
  parts.push(`d:'${wasm.toString('base64')}'`);
  return `{${parts.join(',')}}`;
}


function loadModule(filename: string) {
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
    // attach stack for block identification
    UNITS[0].stack = e.stack || '';
  }
}

// TODO...
async function loadModuleES6(filename: string) {
  const modulePath = path.resolve(filename);
  const randStr = Math.random().toString(36).replace(/[^a-z]+/g, '').slice(0, 5);
  await import(modulePath + `?bogus=${randStr}`).catch(e => {
    if (!(e instanceof EmWasmReadExit)) {
      console.log('error during require:', e);
      return;
    }
    // attach stack for block identification
    UNITS[0].stack = e.stack || '';
  })
}


async function processFile(filename: string) {
  // parse file for wasm blocks
  let content = fs.readFileSync(filename, {encoding: 'utf-8'});
  let blocks = parseFileContent(content, filename);
  if (!blocks.length) return;
  console.log(`${blocks.length} wasm code blocks found in ${filename}`);

  // iterate file blocks until done
  while (blocks.length) {
    // should only load one description a time
    UNITS.length = 0;
    // TODO: ES6 module loading support
    loadModule(filename);
    //await loadModuleES6(filename);
    if (!UNITS.length) {
      console.warn('Warning: ##EMWASM## block without call to EmWasm** found, skipping');
      break;
    }
    const wdef = UNITS[0];
    const blockId = identifyBlock(wdef, blocks, filename, content);
    const block = blocks[blockId];
    console.log(`\n'${wdef.definition.name}' at ${filename}, offset [${block.start},${block.end}]:\n`);

    // compile & create new block
    const wasm = compileEmscripten(wdef.definition);
    const blockReplace = createCompiledBlock(wasm, wdef);

    // write output
    const final: string[] = [content.slice(0, block.start), blockReplace, content.slice(block.end)];
    fs.writeFileSync(filename, final.join(''));

    // re-parse
    content = fs.readFileSync(filename, {encoding: 'utf-8'});
    blocks = parseFileContent(content, filename);
  }
}


// default glob pattern
const DEFAULT_GLOB = ['./**/*.wasm.js']


function runWatcher(args: string[]) {
  args.splice(args.indexOf('-w'), 1);
  const pattern = args.length ? args : DEFAULT_GLOB;
  console.log(`Starting watch mode with pattern ${pattern.join(' ')}`);
  chokidar.watch(pattern).on('all', (event, filename) => {
    if (['add', 'change'].includes(event)) {
      try {
        processFile(filename);
      } catch (e) {
        console.error(`Error while processing ${filename}:`);
        console.log(e);
      }
      console.log('\n\n');
    }
  });
}


async function main() {
  const args = process.argv.slice(2);
  if (args.indexOf('-w') !== -1) {
    return runWatcher(args);
  }
  if (!args.length) {
    return console.log(`usage: emwasm [-w] files|glob`);
  }
  for (const filename of args) {
    await processFile(filename);
  }
}
main();
