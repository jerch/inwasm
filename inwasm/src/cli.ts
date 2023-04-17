#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { IWasmDefinition, CompilerRunner, _IWasmCtx, OutputMode, OutputType } from '.';

import * as chokidar from 'chokidar';
import { globSync, hasMagic } from 'glob';

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

import { green, yellow } from 'colorette';
import { APP_ROOT, PROJECT_ROOT, CONFIG, SHELL, isPosix, WABT_TOOL } from './config';

// compiler runners
import emscripten_c from './runners/emscripten_c';
import clang_c from './runners/clang_c';
import zig from './runners/zig';
import wat from './runners/wat';
import rust from './runners/rust';
import custom from './runners/custom';
import { extractMemorySettings } from './helper';


console.log(green('[inwasm config]'), 'used configration:');
console.log('APP_ROOT:', APP_ROOT);
console.log('PROJECT_ROOT:', PROJECT_ROOT);
console.log(CONFIG);


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


class InWasmReadExit extends Error { }


/**
 * TODO:
 * - cmdline switch + config option for: force-recompile -force
 * - config option for: builddir (default: PROJECT/inwasm-builds)
 * - cmdline switch + config option for fail behavior:
 *    - fail-hard: stop at any error with returncode != 0
 *    - fail-soft: build as much as possible, returncode != 0
 *    - no-fail: only report errors, returncode 0 (default in watch mode)
 * - verbosity - silence most by default, escalate with -v, -vv etc.
 */


/**
 * clang specifics
 *
 * https://lld.llvm.org/WebAssembly.html
 * https://clang.llvm.org/docs/AttributeReference.html
 * https://github.com/schellingb/ClangWasm
 * https://surma.dev/things/c-to-webassembly/
 * https://github.com/jedisct1/libclang_rt.builtins-wasm32.a
 * https://depth-first.com/articles/2019/10/16/compiling-c-to-webassembly-and-running-it-without-emscripten/
 * https://aransentin.github.io/cwasm/
 *
 * __attribute__((import_module("env"), import_name("externalFunction"))) void externalFunction(void);
 * __attribute__((export_name(<name>)))
 * __attribute__((import_module(<module_name>)))
 * __attribute__((import_name(<name>)))
 */


const COMPILER_RUNNERS: { [key: string]: CompilerRunner } = {
  'C': emscripten_c,
  'Clang-C': clang_c,
  'Zig': zig,
  'wat': wat,
  'Rust': rust,
  'custom': custom
};


// global var to hold loaded description
let UNITS: IWasmSourceDefinition[] = [];


// inject global compile ctx object
(global as any)._wasmCtx = {
  add: (definition) => {
    if (!definition.name) return;
    try {
      throw new InWasmReadExit('exit');
    } catch (e) {
      if (e instanceof InWasmReadExit)
        UNITS.push({ definition, stack: e.stack || '' });
      throw e;
    }
  }
} as _IWasmCtx;


/**
 * Parse callstack from InWasmReadExit errors.
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
 * Find first stack frame in `filename` following an `InWasm` call.
 * This assumes, that every error location has a distinct `InWasm` call
 * and has no further indirection.
 */
function getStackFrame(callstack: IStackFrameInfo[], filename: string): IStackFrameInfo {
  for (let i = 0; i < callstack.length; ++i) {
    if (callstack[i].unit.indexOf(filename) !== -1) {
      if (callstack[i - 1] && callstack[i - 1].at === 'InWasm') return callstack[i];
    }
  }
  throw new Error('error finding distinct InWasm call from callstack');
}


/**
 * Returns argument node of `InWasm({...})` call from matching stack frame.
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
  if (!calls.length) throw new Error('malformed source: no InWasm CallExpression found');
  let idx = 0;
  if (calls.length !== 1) {
    // find the innermost (highest start), sanity check for lowest end
    for (let i = 1; i < calls.length; ++i)
      if (calls[idx].start < calls[i].start) idx = i;
    if (calls[idx].end > Math.min(...calls.map(el => el.end)))
      throw new Error('malformed source: could not determine InWasm CallExpression');
  }
  // innermost call is expected to get wasm definition as {...} literal
  const args = (calls[idx] as any).arguments;
  if (!args || args.length != 1 || args[0].type !== 'ObjectExpression')
    throw new Error('malformed source: expected one ObjectExpression argument');
  // FIXME: should we check for proper definition object content here?
  // console.log(args[0].properties.map((el: any) => el.key.name));
  return args[0];
}


function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


/**
 * Prepare build folder and call compiler backend.
 */
/**
 * TODO: implement conditional re-compilation:
 * - on changes: diff definitions + additional source files (investigate how make determines recompilation)
 * - -f/force_recompilation setting
 *
 * default: recompile only on changes
 * also store last definition in build folders --> needed for diffing
 * (bonus side effect: by committing the definition + final.wasm from builds folders later on,
 * expensive recompilation with SDKs bootstrapping can be avoided) --> lifts burden from `npm install`
 */
async function compileWasm(def: IWasmDefinition, filename: string): Promise<Buffer> {
  console.log(yellow('[inwasm compile]'), `Building ${filename}:${def.name}`);
  // FIXME: ensure we are at project root path
  // get memory settings
  const memorySettings = extractMemorySettings(def);
  // create build folders
  const baseDir = path.resolve('./inwasm-builds');
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir);
  const buildDir = path.join(baseDir, filename, def.name);
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
  else {
    if (!SWITCHES.force) {
      // conditional re-compilation
      if (fs.existsSync(path.join(buildDir, 'final.wasm')) && fs.existsSync(path.join(buildDir, 'definition'))) {
        const oldDef = fs.readFileSync(path.join(buildDir, 'definition'), { encoding: 'utf-8' });
        // TODO: re-enable once we have a force recompilation switch
        if (oldDef === JSON.stringify({def, memorySettings})) {
          console.log(green('[inwasm compile]'), `Skipping '${def.name}' (unchanged).\n`);
          return fs.readFileSync(path.join(buildDir, 'final.wasm'));
        }
      }
    }
  }
  const wd = process.cwd();
  let result: Buffer;
  try {
    result = Buffer.from(await COMPILER_RUNNERS[def.srctype](def, buildDir, filename, memorySettings));
    // FIXME: abort on error...
  } finally {
    process.chdir(wd);
  }
  if (!result || !result.length) throw new Error('compile error');
  // generate final.wasm, final.wat and definition file in build folder
  const target = path.join(buildDir, 'final');
  fs.writeFileSync(target + '.wasm', result);
  fs.writeFileSync(path.join(buildDir, 'definition'), JSON.stringify({def, memorySettings}));
  // FIXME: how to deal with custom features here, and in runners?
  const call = `${WABT_TOOL.wasm2wat} "${target + '.wasm'}" -o "${target + '.wat'}"`;
  execSync(call, { shell: SHELL, stdio: 'inherit' });
  console.log(green('[inwasm compile]'), `Successfully built '${def.name}' (${formatBytes(result.length)}).\n`);
  if (result.length > 4095 && def.mode === OutputMode.SYNC && def.type !== OutputType.BYTES) {
    console.log(yellow('[inwasm compile]'), `Warning: The generated wasm unit '${def.name}'`);
    console.log('                 will most likely not work in browser main context.\n');
  }
  return result;
}


/**
 * Create minimal runtime definition as source string.
 */
function createRuntimeDefinition(wasm: Buffer, wdef: IWasmSourceDefinition): string {
  const parts: string[] = [];
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
    if (!(e instanceof InWasmReadExit)) {
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
    if (!(e instanceof InWasmReadExit)) {
      console.log('error during module import:', e);
      return;
    }
  })
}


/**
 * Process a single source file.
 */
async function processFile(filename: string) {
  let handledUnits: string[] = [];
  let lastStackFrame: IStackFrameInfo = { at: '', unit: '', line: -1, column: -1 };
  // read file content, exit early if no InWasm was found at all
  let content = fs.readFileSync(filename, { encoding: 'utf-8' });
  if (content.indexOf('InWasm') === -1) return;

  // loop until all InWasmReadExit errors are resolved
  while (true) {
    // load module - may fill UNITS with next discovered definitions
    UNITS.length = 0;
    // TODO: ES6 module loading support
    loadModule(filename);
    //await loadModuleES6(filename);

    // done if the module does not throw InWasmReadExit anymore
    if (!UNITS.length) break;

    const final: string[] = [];
    let lastEnd = 0;
    // FIXME: this expects UNITS to be sorted by start!!
    for (const wdef of UNITS) {
      if (handledUnits.indexOf(wdef.definition.name) !== -1) {
        throw Error(
          `Inwasm definition.name must be unique within a source file.\n`
          + `       "${wdef.definition.name}" is duplicated in "${filename}".`);
      }
      // get stack position, error if we dont make any progress
      const stackFrame = getStackFrame(parseCallStack(wdef.stack), filename);
      if (lastStackFrame.line === stackFrame.line && lastStackFrame.column === stackFrame.column) {
        throw new Error(`unable to parse/compile InWasm call at ${filename}:${stackFrame.line}:${stackFrame.column}`);
      }
      lastStackFrame = stackFrame;

      // match stack position to source pos
      const block = identifyDefinitionBlock(stackFrame, content);

      // compile & create new block
      const wasm = await compileWasm(wdef.definition, filename);
      const blockReplace = createRuntimeDefinition(wasm, wdef);

      // push parts with replacement
      final.push(content.slice(lastEnd, block.start));
      final.push(` /* def: "${wdef.definition.name}" */ `);
      final.push(blockReplace);
      lastEnd = block.end;

      handledUnits.push(wdef.definition.name);
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
async function runWatcher(args: string[]) {
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
  await new Promise<void>(r => {
    process.on('SIGINT', r);
    process.on('SIGQUIT', r);
    process.on('SIGTERM', r);
  });
}


// some cmdline switches
const SWITCHES = {
  watch: false,
  force: false
};


function extractSwitches(args: string[]): string[] {
  /**
   * known switches:
   *  -w    watch mode
   *  -f    force recompilation
   * more to come...
   */
  if (args.indexOf('-w') !== -1) {
    args.splice(args.indexOf('-w'), 1);
    SWITCHES.watch = true;
  }
  if (args.indexOf('-f') !== -1) {
    args.splice(args.indexOf('-f'), 1);
    SWITCHES.force = true;
  }
  return args;
}

async function main(): Promise<number> {
  const args = extractSwitches(process.argv.slice(2));
  if (SWITCHES.watch) {
    await runWatcher(args);
    return 0;
  }
  if (!args.length) {
    console.log(`usage: inwasm [-wf] files|glob`);
    return 1;
  }
  // minimal globbing support to work around window shell limitations
  const files = args.length === 1 && hasMagic(args, { magicalBraces: true })
    ? globSync(args[0])
    : args;
  const startTime = Date.now();
  for (const filename of files) {
    await processFile(filename);
  }
  console.log(green('[inwasm]'), `Finished in ${Date.now() - startTime} msec.\n`);
  return 0;
}

// handle exit code from promise resolve
main().then(
  () => process.exit(0),
  err => { console.error(err); process.exit(1); }
);
