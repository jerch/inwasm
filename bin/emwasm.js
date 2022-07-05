const fs = require('fs');
const os = require('os');
const path = require('path');
const execSync = require('child_process').execSync;

let units = {};

global._emwasm_compiler = {
  add_unit: definition => {
    units[definition.name] = definition;
  }
};

function parseFile(filename) {
  const cleanup = [];
  const blocks = {};
  const content = fs.readFileSync(filename, {encoding: 'utf-8'});
  const lines = content.split('\n');
  let wasm_block = '';
  for (const line of lines) {
    if (line.includes('##EM_WASM##')) {
      if (wasm_block) throw new Error('nesting wasm definitions are not allowed');
      wasm_block = line.split('##EM_WASM##')[1].trim();
      cleanup.push(`##wasm_block: ${wasm_block}`);
      blocks[wasm_block] = [];
    }
    if (!wasm_block) {
      cleanup.push(line);
    } else {
      blocks[wasm_block].push(line);
    }
    if (line.includes('##END_EM_WASM##')) {
      if (!wasm_block) throw new Error('unmatched ##END_EM_WASM## directive');
      wasm_block = '';
    }
  }
  return {blocks, cleanup};
}

function compile_emscripten(definition) {
  let result;
  const wd = process.cwd();
  let tmpDir;
  const appPrefix = 'em-wasm_';
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), appPrefix));
    console.log('tmp dir:', tmpDir);
    process.chdir(tmpDir);
    const sdk = `source ${wd}/emsdk/emsdk_env.sh > /dev/null 2>&1`;
    const src = 'src.c';
    const target = 'src.wasm';
    const opt = `-O3`;
    fs.writeFileSync(src, definition.code);
    const defines = Object.entries(definition.defines)
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
  } catch (e) {}
  finally {
    try {
      if (tmpDir) fs.rmSync(tmpDir, {recursive: true});
    } catch (e) {}
  }
  process.chdir(wd);
  if (!result) throw new Error('compile error');
  return result;
}

function wrap_unit(wasm, definition) {
  const defines = [];
  for ([k, v] of Object.entries(definition.defines)) {
    if (typeof v === 'number') {
      defines.push(`${k}: ${v}`);
    } else if (typeof v === 'string') {
      defines.push(`${k}: '${v}'`);
    }
  }
  tmpl = `const ${definition.name} = (() => {
  function _d(s) {
    if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64');
    const bs = atob(s);
    const r = new Uint8Array(bs.length);
    for (let i = 0; i < r.length; ++i) r[i] = bs.charCodeAt(i);
    return r;
  }
  const inst = new WebAssembly.Instance(
    new WebAssembly.Module(_d('${wasm.toString('base64')}'))
    ${definition.imports ? ', {env: '+definition.imports+'}' : ''}
  );
  inst.defines = {${defines.join(',')}};
  return inst;
})();`;
  return tmpl;
}


function requireUncached(module) {
  delete require.cache[require.resolve(module)];
  return require(module);
}


function main() {
  // FIXME: proper multiple wasm blocks support (process only one block at max)
  console.log(process.argv[2], process.argv.length);
  let data = parseFile(process.argv[2]);
  for (const block of Object.keys(data.blocks)) {
    console.log(`Processing wasm unit '${block}':`);
    units = {};
    try {
      requireUncached('../' + process.argv[2]);
    } catch (e) {}
    wasm = compile_emscripten(units[block]);
    block_replace = wrap_unit(wasm, units[block]);
    for (let i = 0; i < data.cleanup.length; ++i) {
      if (data.cleanup[i] === `##wasm_block: ${block}`) {
        data.cleanup[i] = block_replace;
        break;
      }
    }
    for (let i = 0; i < data.cleanup.length; ++i) {
      if (data.cleanup[i].startsWith('##wasm_block')) {
        const block = data.cleanup[i].split(': ')[1];
        data.cleanup[i] = data.blocks[block].join('\n');
      }
    }
    const final = data.cleanup.join('\n');
    fs.writeFileSync(process.argv[2], final);
    data = parseFile(process.argv[2]);
  }
}

main();
