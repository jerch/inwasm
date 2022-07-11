#!/usr/bin/env node

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { IWasmDefinition, _IEmWasmCtx } from './definitions';

import * as chokidar from 'chokidar';

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';


interface IWasmSourceDefinition {
  definition: IWasmDefinition;
  stack: string;
}


interface IStackFrameInfo {
  at: string;
  unit: string;
  line: number;
  column: number;
}


class EmWasmReadExit extends Error { }


// global var to hold loaded description
let UNITS: IWasmSourceDefinition[] = [];


// inject global compile ctx object
(global as any)._emwasmCtx = {
  add: (definition) => {
    if (!definition.name) return;
    try {
      throw new EmWasmReadExit('exit');
    } catch (e) {
      if (e instanceof EmWasmReadExit)
        UNITS.push({definition, stack: e.stack || ''});
      throw e;
    }
  }
} as _IEmWasmCtx;


/**
 * Parse callstack from EmWasmReadExit errors.
 */
function parseCallStack(callstack: string): IStackFrameInfo[] {
  const stack = callstack.split('\n');
  if (!stack.length) throw new Error('cannot work with empty stack');
  const entries: IStackFrameInfo[] = [];
  for (let i = 1; i < stack.length; ++i) {
    const line = stack[i];
    // default case: '   at callXY (file.js:123:45)
    const m = line.match(/^\s*at (.*?) [(](.*?):(\d+):(\d+)[)]$/);
    // rare case w'o at: '   at file.js:123:45'
    const n = line.match(/^\s*at (.*?):(\d+):(\d+)$/);
    if (!m && !n) throw new Error('error parsing stack positions');
    if (m)
      entries.push({ at: m[1], unit: m[2], line: parseInt(m[3]), column: parseInt(m[4]) });
    else if (n)
      entries.push({ at: '', unit: n[1], line: parseInt(n[2]), column: parseInt(n[3]) });
  }
  return entries;
}


/**
 * Find first stack frame in `filename` following an `EmWasm` call.
 * This assumes, that every error location has a distinct `EmWasm` call
 * and has no further indirection.
 */
function getStackFrame(callstack: IStackFrameInfo[], filename: string): IStackFrameInfo {
  for (let i = 0; i < callstack.length; ++i) {
    if (callstack[i].unit.indexOf(filename) !== -1) {
      if (callstack[i - 1] && callstack[i - 1].at === 'EmWasm') return callstack[i];
    }
  }
  throw new Error('error finding distinct EmWasm call from callstack');
}


/**
 * Returns argument node of `EmWasm({...})` call from matching stack frame.
 *
 * Search/narrowing happens by these steps:
 * - find closest single CallExpression node at stack frame position, otherwise throw
 * - check for single node argument of type ObjectExpression, otherwise throw
 */
function identifyDefinitionBlock(stackFrame: IStackFrameInfo, content: string): acorn.Node {
  const ast = acorn.parse(content, { locations: true, ecmaVersion: 'latest' });
  const calls: acorn.Node[] = [];
  walk.simple(ast, {
    CallExpression(node) {
      // FIXME: needs descending check for nested CallExpression
      if (node.loc!.start.line <= stackFrame.line && node.loc!.end.line >= stackFrame.line) {
        const start = node.loc!.start;
        const end = node.loc!.end;
        if (start.line === stackFrame.line && end.line === stackFrame.line) {
          // cut any before/after on same line
          if (start.column < stackFrame.column && end.column < stackFrame.column) return;
          if (start.column > stackFrame.column) return;
        }
        calls.push(node);
      }
    }
  });
  // expected: exactly at least one CallExpression with exactly one argument of type ObjectExpression
  if (!calls.length) throw new Error('malformed source: no EmWasm CallExpression found');
  let idx = 0;
  if (calls.length !== 1) {
    // find the innermost (highest start), sanity check for lowest end
    for (let i = 1; i < calls.length; ++i)
      if (calls[idx].start < calls[i].start) idx = i;
    if (calls[idx].end > Math.min(...calls.map(el => el.end)))
      throw new Error('malformed source: could not determine EmWasm CallExpression');
  }
  // innermost call is expected to get wasm definition as {...} literal
  const args = (calls[idx] as any).arguments;
  if (!args || args.length != 1 || args[0].type !== 'ObjectExpression')
    throw new Error('malformed source: expected one ObjectExpression argument');
  // FIXME: should we check for proper definition object content here?
  // console.log(args[0].properties.map((el: any) => el.key.name));
  return args[0];
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
 * TODO: support for AS - assemblyscript, zig or rust?
 */


/**
 * Compile with emscripten.
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
    const target = `${definition.name}.wasm`;
    const opt = `-O3`;
    fs.writeFileSync(src, definition.code);
    const defines = Object.entries(definition.compile?.defines || {})
      .map(el => `-D${el[0]}=${el[1]}`).join(' ');
    const _funcs = Object.entries(definition.exports)
      .filter(el => typeof el[1] === 'function')
      .map(el => `"_${el[0]}"`)
      .join(',');
    let add_switches = '';
    if (definition.compile && definition.compile.switches) {
      add_switches = definition.compile.switches.join(' ');
    }
    const switches = `-s ERROR_ON_UNDEFINED_SYMBOLS=0 -s WARN_ON_UNDEFINED_SYMBOLS=0 ` + add_switches;
    const funcs = `-s EXPORTED_FUNCTIONS='[${_funcs}]'`;
    const call = `${sdk} && emcc ${opt} ${defines} ${funcs} ${switches} --no-entry ${src} -o ${target}`;
    console.log(call);
    execSync(call, { shell: '/bin/bash', stdio: 'inherit' });

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
  } catch (e) {
    console.log(e);
  }
  finally {
    try {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true });
    } catch (e) { }
  }
  process.chdir(wd);
  if (!result) throw new Error('compile error');
  return result;
}


/**
 * Create minimal runtime definition as source string.
 */
function createRuntimeDefinition(wasm: Buffer, wdef: IWasmSourceDefinition): string {
  const parts: string[] = [];
  parts.push(`e:${wdef.definition.imports || 0}`);
  parts.push(`s:${wdef.definition.mode || 0}`);
  parts.push(`t:${wdef.definition.type || 0}`);
  parts.push(`d:'${wasm.toString('base64')}'`);
  return `{${parts.join(',')}}`;
}


/**
 * Load module `fielname` as node module.
 */
function loadModule(filename: string) {
  try {
    // FIXME: needs ES6 patch
    const modulePath = path.resolve(filename);
    delete require.cache[require.resolve(modulePath)];
    require(modulePath);
  } catch (e) {
    if (!(e instanceof EmWasmReadExit)) {
      console.log('error during module require:', e);
      return;
    }
  }
}


/**
 * Load module `filename` as ES6 module.
 */
// TODO...
async function loadModuleES6(filename: string) {
  const modulePath = path.resolve(filename);
  const randStr = Math.random().toString(36).replace(/[^a-z]+/g, '').slice(0, 5);
  await import(modulePath + `?bogus=${randStr}`).catch(e => {
    if (!(e instanceof EmWasmReadExit)) {
      console.log('error during module import:', e);
      return;
    }
  })
}


/**
 * Process a single source file.
 */
async function processFile(filename: string) {
  let lastStackFrame: IStackFrameInfo = { at: '', unit: '', line: -1, column: -1 };
  // read file content, exit early if no EmWasm was found at all
  let content = fs.readFileSync(filename, { encoding: 'utf-8' });
  if (content.indexOf('EmWasm') === -1) return;

  // loop until all EmWasmReadExit errors are resolved
  while (true) {
    // load module - may fill UNITS with next discovered definitions
    UNITS.length = 0;
    // TODO: ES6 module loading support
    loadModule(filename);
    //await loadModuleES6(filename);

    // done if the module does not throw EmWasmReadExit anymore
    if (!UNITS.length) break;

    const final: string[] = [];
    let lastEnd = 0;
    for (const wdef of UNITS) {
      // get stack position, error if we dont make any progress
      const stackFrame = getStackFrame(parseCallStack(wdef.stack), filename);
      if (lastStackFrame.line === stackFrame.line && lastStackFrame.column === stackFrame.column) {
        throw new Error(`unable to parse/compile EmWasm call at ${filename}:${stackFrame.line}:${stackFrame.column}`);
      }
      lastStackFrame = stackFrame;

      // match stack position to source pos
      const block = identifyDefinitionBlock(stackFrame, content);

      // compile & create new block
      const wasm = compileEmscripten(wdef.definition);
      const blockReplace = createRuntimeDefinition(wasm, wdef);

      // push parts with replacement
      final.push(content.slice(lastEnd, block.start));
      final.push(blockReplace);
      lastEnd = block.end;
    }
    final.push(content.slice(lastEnd));

    // write output
    fs.writeFileSync(filename, final.join(''));

    // re-read content
    content = fs.readFileSync(filename, { encoding: 'utf-8' });
  }
}


// default glob pattern
const DEFAULT_GLOB = ['./**/*.wasm.js']


/**
 * Run in watch mode.
 */
function runWatcher(args: string[]) {
  args.splice(args.indexOf('-w'), 1);
  const pattern = args.length ? args : DEFAULT_GLOB;
  console.log(`Starting watch mode with pattern ${pattern.join(' ')}`);
  chokidar.watch(pattern).on('all', async (event, filename) => {
    if (['add', 'change'].includes(event)) {
      try {
        await processFile(filename);
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
