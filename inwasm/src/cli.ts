#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'url';
import { randomBytes, createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { type IWasmDefinition, type CompilerRunner, type _IWasmCtx, OutputMode, OutputType } from './index.js';

import * as chokidar from 'chokidar';
import { globSync, hasMagic } from 'glob';

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

import { green, yellow } from 'colorette';
import { APP_ROOT, PROJECT_ROOT, CONFIG, SHELL, isPosix, WABT_TOOL } from './config.js';

// compiler runners
import emscripten_c from './runners/emscripten_c.js';
import emscripten_cpp from './runners/emscripten_cpp.js';
import clang_c from './runners/clang_c.js';
import clang_cpp from './runners/clang_cpp.js';
import zig from './runners/zig.js';
import wat from './runners/wat.js';
import rust from './runners/rust.js';
import custom from './runners/custom.js';
import { extractMemorySettings } from './helper.js';


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
 * - config option for: builddir (default: PROJECT/inwasm-builds)
 * - cmdline switch + config option for fail behavior:
 *    - fail-hard: stop at any error with returncode != 0
 *    - fail-soft: build as much as possible, returncode != 0
 *    - no-fail: only report errors, returncode 0 (default in watch mode)
 * - verbosity - silence most by default, escalate with -v, -vv?
 */


const COMPILER_RUNNERS: { [key: string]: CompilerRunner } = {
  'C': emscripten_c,
  'C++': emscripten_cpp,
  'Clang-C': clang_c,
  'Clang-C++': clang_cpp,
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


function randomId(n: number): string {
  return randomBytes(n).toString('hex');
}

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
  if (!isPosix) {
    filename = filename.replaceAll('/', '\\');
  }
  for (let i = 0; i < callstack.length; ++i) {
    if (callstack[i].unit.indexOf(filename) !== -1) {
      if (callstack[i - 1] && callstack[i - 1].at === 'InWasm') return callstack[i];
    }
  }
  console.log(callstack);
  console.log(filename);
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
  const ast = acorn.parse(content, { locations: true, ecmaVersion: 'latest', sourceType: 'module' });
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
 * Resolve glob pattern to ordered list of filenames.
 */
function getTrackedFilenames(trackChanges: string[] | undefined): string[] {
  if (!trackChanges || !trackChanges.length) {
    return [];
  }
  let filenames: string[] = [];
  for (const entry of trackChanges) {
    filenames = filenames.concat(globSync(entry));
  }
  filenames.sort();
  return filenames;
}


/**
 * Create a hash from filenames and mtimes.
 */
function mtimesHash(filenames: string[]): string {
  const hash = createHash('sha256');
  for (const fname of filenames) {
    hash.update(fname);
    hash.update(fs.statSync(fname).mtime.getTime().toString());
  }
  return hash.digest('hex');
}


/**
 * Create a hash from file contents.
 * Other than the mtime hash this does not hash filenames to avoid
 * hash differences from different path notations.
 */
function contentsHash(filenames: string[]): string {
  const hash = createHash('sha256');
  for (const fname of filenames) {
    hash.update(fs.readFileSync(fname));
  }
  return hash.digest('hex');
}

/**
 * Create a single mtime or content hash from tracked globbing file pattern.
 */
function hashTracked(mode: 'mtime' | 'content' | undefined, trackChanges: string[] | undefined): string {
  const filenames = getTrackedFilenames(trackChanges);
  if (!filenames.length) return '';
  if (mode === 'content') return contentsHash(filenames);
  return mtimesHash(filenames);
}


function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}


/**
 * Prepare build folder and call compiler backend.
 */
async function compileWasm(def: IWasmDefinition, filename: string, srcDef: string): Promise<Buffer> {
  console.log(yellow('[inwasm compile]'), `Building ${filename}:${def.name}`);

  const memorySettings = extractMemorySettings(def);

  // create build folders
  const baseDir = path.resolve('./inwasm-builds');
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir);
  }
  const buildDir = path.join(baseDir, filename, def.name);
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  } else {
    /**
     * conditional re-compilation:
     * - final.wasm exists
     *    - skip -S                         -> load cached wasm file (also for noCache)
     *    - noCache                         -> compile
     *    - equal definition exists         -> load cached wasm file
     *    - no definition or not equal      -> compile
     * - force -f                           -> compile
     * - no final.wasm                      -> compile
     */
    const wasmPath = path.join(buildDir, 'final.wasm');
    if (fs.existsSync(wasmPath) && !SWITCHES.force && (!def.noCache || (def.noCache && SWITCHES.skip))) {
      if (SWITCHES.skip) {
        console.log(green('[inwasm compile]'), `Skipping '${def.name}' (force-skipped by -S).\n`);
        return fs.readFileSync(wasmPath);
      }
      if (fs.existsSync(path.join(buildDir, 'definition.json'))) {
        const oldDef = fs.readFileSync(path.join(buildDir, 'definition.json'), { encoding: 'utf-8' });
        const calcDef = JSON.stringify({ def, memorySettings, srcDef, hash: hashTracked(def.trackMode, def.trackChanges) });
        if (oldDef === calcDef) {
          console.log(green('[inwasm compile]'), `Skipping '${def.name}' (unchanged).\n`);
          return fs.readFileSync(wasmPath);
        }
      }
    }
  }
  const wd = process.cwd();
  let result: Buffer;
  try {
    result = Buffer.from(await COMPILER_RUNNERS[def.srctype](def, buildDir, filename, memorySettings));
  } finally {
    process.chdir(wd);
  }
  if (!result || !result.length) throw new Error('compile error');

  // generate final.wasm, final.wat and definition file in build folder
  const target = path.join(buildDir, 'final');
  fs.writeFileSync(target + '.wasm', result);
  fs.writeFileSync(
    path.join(buildDir, 'definition.json'),
    JSON.stringify({ def, memorySettings, srcDef, hash: hashTracked(def.trackMode, def.trackChanges) })
  );

  // expose wat file for inspection
  const call = `${WABT_TOOL.wasm2wat} "${target + '.wasm'}" --enable-all -o "${target + '.wat'}"`;
  execSync(call, { shell: SHELL, stdio: 'inherit' });

  console.log(green('[inwasm compile]'), `Successfully built '${def.name}' (${formatBytes(result.length)}).\n`);
  if (result.length > 8000000 && def.mode === OutputMode.SYNC && def.type !== OutputType.BYTES) {
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
 * Load module `filename` as ES6 module.
 */
// TODO...
async function loadModuleES6(filename: string) {
  const modulePath = pathToFileURL(path.resolve(filename));
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
async function processFile(filename: string, id: string) {
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
    //loadModule(filename);
    await loadModuleES6(filename);

    // done if the module does not throw InWasmReadExit anymore
    if (!UNITS.length) break;

    const final: string[] = [];
    let lastEnd = 0;
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
      const wasm = await compileWasm(wdef.definition, filename, content.slice(block.start, block.end));
      const blockReplace = createRuntimeDefinition(wasm, wdef);

      // push parts with replacement
      final.push(content.slice(lastEnd, block.start));
      final.push(`/*inwasm#${id}:rdef-start:"${wdef.definition.name}"*/`);
      final.push(blockReplace);
      final.push(`/*inwasm#${id}:rdef-end:"${wdef.definition.name}"*/`);
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


function reprocessSkipped(filename: string, id: string): boolean {
  let content = fs.readFileSync(filename, { encoding: 'utf-8' });
  if (content.indexOf('InWasm') === -1) return false;

  // collect comments from source
  const comments: any[] = [];
  acorn.parse(content, { locations: true, ecmaVersion: 'latest', onComment: comments, sourceType: 'module' });

  const reval: {[key: string]: {start: number, end: number, src: string}} = {};

  // filter comments for inwasm#hhhhhhhhhhhhhhhh:rdef-start|end:"name"
  const REX = /^inwasm#(?<id>[0-9a-f]{16}):rdef-(?<type>end|start):"(?<name>.+?)"$/;
  for (const comment of comments) {
    const m = comment.value.match(REX);
    if (m && m.groups.id !== id) {
      if (m.groups.type === 'end') {
        if (reval[m.groups.name]) {
          reval[m.groups.name].end = comment.end;
        }
        continue;
      }
      const buildDir = path.join(path.resolve('./inwasm-builds'), filename, m.groups.name);
      if (!fs.existsSync(path.join(buildDir, 'definition.json'))) {
        // we lost the builddir for some reason?
        return false;
      }
      const def = JSON.parse(fs.readFileSync(path.join(buildDir, 'definition.json'), { encoding: 'utf-8' }));

      /**
       * re-run on:
       * - force switch
       * - noCache flag
       * - hash difference (either mtime or content)
       */
      if (SWITCHES.force || def.def.noCache || hashTracked(def.def.trackMode, def.def.trackChanges) !== def.hash) {
        if (m.groups.type === 'start') {
          reval[m.groups.name] = {start: comment.start, end: -1, src: def.srcDef};
        }
      }
    }
  }

  // re-create first unit matched from above
  for (const [k, v] of Object.entries(reval)) {
    if (v.start === -1 || v.end === -1) {
      throw new Error('unbalanced inwasm comments');
    }
    fs.writeFileSync(filename, content.slice(0, v.start) + v.src + content.slice(v.end));
    return true;
  }
  return false;
}


/**
 * Watchers for foreign files per source file.
 */
interface IPatternWatcher {
  pattern: Set<string>;
  watcher: chokidar.FSWatcher;
}
const watchers: {[key: string]: IPatternWatcher} = {};


function updateForeignWatch(filename: string) {
  let content = fs.readFileSync(filename, { encoding: 'utf-8' });
  if (content.indexOf('InWasm') === -1) return false;

  // collect comments from source
  const comments: any[] = [];
  acorn.parse(content, { locations: true, ecmaVersion: 'latest', onComment: comments });

  const pattern: Set<string> = new Set();

  // filter comments for inwasm#hhhhhhhhhhhhhhhh:rdef-start|end:"name"
  const REX = /^inwasm#(?<id>[0-9a-f]{16}):rdef-(?<type>end|start):"(?<name>.+?)"$/;
  for (const comment of comments) {
    const m = comment.value.match(REX);
    if (m && m.groups.type === 'start') {
      const buildDir = path.join(path.resolve('./inwasm-builds'), filename, m.groups.name);
      if (!fs.existsSync(path.join(buildDir, 'definition.json'))) {
        // we lost the builddir for some reason?
        continue;
      }
      const def = JSON.parse(fs.readFileSync(path.join(buildDir, 'definition.json'), { encoding: 'utf-8' }));

      if (def.def.trackChanges) {
        for (const entry of def.def.trackChanges) pattern.add(entry);
      }
    }
  }

  // got nothing to track?
  if (!pattern.size) {
    if (watchers[filename]) {
      watchers[filename].watcher.close();
      delete watchers[filename];
    }
    return;
  }

  // check if nothing has changed
  if (watchers[filename]) {
    const oldPattern = watchers[filename].pattern;
    let isEqual = pattern.size === oldPattern.size;
    if (isEqual) {
      for (const elem of pattern) {
        if (!oldPattern.has(elem)) {
          isEqual = false;
          break;
        }
      }
    }
    if (isEqual) return;
  }

  // we have changes in tracks
  if (watchers[filename]) {
    // pattern changed, close old watcher
    watchers[filename].watcher.close();
  }

  const watcher = chokidar.watch(Array.from(pattern));
  watcher.on('change', () => {
    try {
      /**
       * trigger rebuild:
       * - already built targets by reprocessSkipped
       * - uncompiled targets by explicit mtime change
       */
      if (!reprocessSkipped(filename, randomId(8))) {
        const t = new Date();
        fs.utimesSync(filename, t, t);
      }
    } catch (e) {
      console.error(`Error while processing ${filename}:`);
      console.log(e);
    }
  });
  watchers[filename] = {pattern, watcher};
}


// default glob pattern
const DEFAULT_GLOB = ['./**/*.wasm.js']


/**
 * Run in watch mode.
 */
async function runWatcher(args: string[]) {
  const pattern = args.length ? args : DEFAULT_GLOB;
  console.log(`Starting watch mode with pattern ${pattern.join(' ')}`);

  const fileHashes: {[key: string]: string} = {};
  chokidar.watch(pattern).on('all', async (event, filename) => {
    if (['add', 'change'].includes(event)) {
      if (sha256(fs.readFileSync(filename)) === fileHashes[filename]) {
        return;
      }
      try {
        const id = randomId(8);
        do {
          await processFile(filename, id);
        } while (reprocessSkipped(filename, id));
        fileHashes[filename] = sha256(fs.readFileSync(filename));
        updateForeignWatch(filename);
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
  force: false,
  skip: false
};


function extractSwitches(args: string[]): string[] {
  /**
   * known switches:
   *  -w    watch mode
   *  -f    force recompilation
   *  -S    skip compilation, if build target was found
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
  if (args.indexOf('-S') !== -1) {
    args.splice(args.indexOf('-S'), 1);
    SWITCHES.skip = !SWITCHES.force;  // apply -S only if -f was not applied
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
    console.log(`usage: inwasm [-wfS] files|glob`);
    return 1;
  }
  // minimal globbing support to work around window shell limitations
  const files = args.length === 1 && hasMagic(args, { magicalBraces: true })
    ? globSync(args[0])
    : args;
  const startTime = Date.now();
  for (const filename of files) {
    const id = randomId(8);
    do {
      await processFile(filename, id);
    } while (reprocessSkipped(filename, id));
  }
  console.log(green('[inwasm]'), `Finished in ${Date.now() - startTime} msec.\n`);
  return 0;
}

// handle exit code from promise resolve
main().then(
  () => process.exit(0),
  err => { console.error(err); process.exit(1); }
);
