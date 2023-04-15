import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

/**
 * Whether to store compiler sdks in the project or
 * globally in the inwasm app folder.
 * This only applies to auto install mode.
 */
export type StoreLocation = 'inwasm' | 'project';

// FIXME: needs better type layout for easier interaction on sdk side
export interface IConfig {
  [key: string]: any;
  zig?: {
    /**
     * Settings to use preinstalled Zig sdk.
     *
     * binary   Path to preinstalled zig binary. Use '$PATH',
     *          if you want to use 'zig' from PATH variable.
     */
    binary: string;
  } | {
    /**
     * Settings to use auto installer for Zig (default).
     *
     * version  Zig version to use (default is 'master')
     * store    whether to store Zig sdk on project or inwasm (default is 'project')
     */
    version: string;
    store: StoreLocation;
  };
  emsdk?: {
    /**
     * Settings to use preinstalled emsdk.
     *
     * path     path to emsdk folder
     */
    path: string;
  } | {
    /**
     * Settings to use auto installer for emsdk (default).
     *
     * version  emsdk version to use (default is 'latest')
     * store    whether to store emsdk on project or inwasm (default is 'project')
     */
    version: string;
    store: StoreLocation;
  }
}


// default config
export const DEFAULT_CONFIG: IConfig = {
  zig: {
    version: 'master',
    store: 'project'
  },
  emsdk: {
    version: 'latest',
    store: 'project'
  }
};


/**
 * Return inwasm's application path.
 */
function getAppRoot(): string {
  // FIXME: needs ESM patch
  let folder = __dirname;
  let found = '';
  while (folder !== path.dirname(folder)) {
    if (fs.existsSync(path.join(folder, 'package.json'))) {
      const content = fs.readFileSync(path.join(folder, 'package.json'), { encoding: 'utf-8' });
      if (JSON.parse(content).name === 'inwasm') {
        found = folder;
        break;
      }
    };
    folder = path.dirname(folder);
  }
  if (!found) throw new Error('cannot determine inwasm app root path');
  return found;
}
export const APP_ROOT = getAppRoot();


/**
 * Return current project root path inwasm was called for.
 */
function getProjectRoot(): string {
  let folder = process.env.PWD || process.cwd();
  let found = '';
  while (folder !== path.dirname(folder)) {
    if (fs.existsSync(path.join(folder, 'package.json')) && fs.existsSync(path.join(folder, 'node_modules'))) {
      found = folder;
      break;
    };
    folder = path.dirname(folder);
  }
  if (!found) throw new Error('cannot determine project root path');
  return found;
}
export const PROJECT_ROOT = getProjectRoot();



function loadConfig(filename: string): IConfig {
  // FIXME: needs ESM shim
  return require(filename);
}


function isObj(item: any) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

function merge(target: IConfig, custom: IConfig): IConfig {
  if (isObj(target) && isObj(custom)) {
    for (const key in custom) {
      if (isObj(custom[key])) {
        Object.assign(target, { [key]: {} });
        merge(target[key], custom[key]);
      } else {
        Object.assign(target, { [key]: custom[key] });
      }
    }
  }
  return target;
}

/**
 * Create a config object from env vars.
 */
function getEnvOverrides(): { [key: string]: any } {
  const envKeys = Object.keys(process.env).filter(el => el.startsWith('INWASM_'));
  const result: { [key: string]: any } = {};
  for (let i = 0; i < envKeys.length; ++i) {
    const path = envKeys[i].split('_').slice(1);
    const value = process.env[envKeys[i]] as string;
    let o = result;
    for (let k = 0; k < path.length; ++k) {
      const lower = path[k].toLowerCase();
      if (k === path.length - 1) o[lower] = value;
      else o[lower] = {};
      o = o[lower];
    }
  }
  return result;
}

/**
 * Loads config in this order overriding blending from previous settings:
 * - DEFAULT_CONFIG
 * - inwasm.config.js (pulled from PROJECT_ROOT)
 * - env overrides
 */
function getConfig(): IConfig {
  // load defaults
  const final: IConfig = Object.assign({}, DEFAULT_CONFIG);

  // merge with config from file
  const configFile = path.join(PROJECT_ROOT, 'inwasm.config.js');
  if (fs.existsSync(configFile)) {
    merge(final, loadConfig(configFile));
  }

  // merge with env overrides
  merge(final, getEnvOverrides());

  // force absolute path expansion for zig.binary and emsdk.path
  if (final.zig && final.zig.hasOwnProperty('binary')) {
    const zigPath = (final.zig as any).binary;
    if (path.basename(zigPath) !== zigPath) {
      (final.zig as any).binary = path.resolve(zigPath);
    }
  }
  if (final.emsdk && final.emsdk.hasOwnProperty('path')) {
    (final.emsdk as any).path = path.resolve((final.emsdk as any).path);
  }

  return final;
}
export const CONFIG = getConfig();


function getWabtPath(): string {
  const inApp = path.join(APP_ROOT, 'node_modules', 'wabt', 'bin');
  if (fs.existsSync(inApp)) {
    return inApp;
  }
  return path.join(PROJECT_ROOT, 'node_modules', 'wabt', 'bin');
}
export const WABT_PATH = getWabtPath();

// shell to be executed
export const SHELL = process.platform === 'win32' ? 'cmd.exe' : execSync('which bash', {encoding: 'utf-8'}).trim();

// simply assume any OS != windows being POSIX compatible
export const isPosix = process.platform !== 'win32';

interface IWabtToolPath {
  'wasm2c': string;
  'wasm-decompile': string;
  'wasm-objdump': string;
  'wasm-strip': string;
  'wat2wasm': string;
  'wasm2wat': string;
  'wasm-interp': string;
  'wasm-opcodecnt': string;
  'wasm-validate': string;
}

// wabt tool path abstraction
function getWabtTool(): IWabtToolPath {
  const p = (name: string) => `"${process.execPath}" "${path.join(getWabtPath(), name)}"`;
  return {
    'wasm2c': p('wasm2c'),
    'wasm-decompile': p('wasm-decompile'),
    'wasm-objdump': p('wasm-objdump'),
    'wasm-strip': p('wasm-strip'),
    'wat2wasm': p('wat2wasm'),
    'wasm2wat': p('wasm2wat'),
    'wasm-interp': p('wasm-interp'),
    'wasm-opcodecnt': p('wasm-opcodecnt'),
    'wasm-validate': p('wasm-validate')
  };
}
export const WABT_TOOL = getWabtTool();
