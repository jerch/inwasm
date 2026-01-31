/**
 * Copyright (c) 2022, 2026 Joerg Breitbart
 * @license MIT
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


/**
 * Where to store compiler sdks.
 * This only applies to auto install mode.
 *
 * Values:
 *  - `inwasm`
 *    - store SDks in the inwasm package
 *  - `project`
 *    - store SDKs in the package folder
 *  - `parent:package_name`
 *    - store SDKs in parent package folder
 *      (inspects package.json for the name)
 *  - `path:path_to_folder`
 *    - store SDKs in given folder (relative or absolute)
 */
export type StoreLocation = 'inwasm' | 'project' | string;

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


/**
 * Return array of parent package folders.
 */
function getParentFolder(): { name: string; folder: string; }[] {
  const parents: { name: string; folder: string; }[] = [];
  let folder = PROJECT_ROOT;
  while (folder !== path.dirname(folder)) {
    if (fs.existsSync(path.join(folder, 'package.json'))) {
      const content = fs.readFileSync(path.join(folder, 'package.json'), { encoding: 'utf-8' });
      const name = JSON.parse(content).name;
      parents.push({name, folder});
    }
    folder = path.dirname(folder);
  }
  return parents;
}
export const PARENT_PACKAGES = getParentFolder();


/**
 * Get the SDK store root path from a StoreLocation entry;
 */
export function getSdkRoot(store: StoreLocation): string {
  let root = '';
  if (store.startsWith('parent:')) {
    const name = store.slice(7);
    for (let i = 0; i < PARENT_PACKAGES.length; ++i) {
      if (PARENT_PACKAGES[i].name === name) {
        root = PARENT_PACKAGES[i].folder;
        return root;
      }
    }
    if (!root) throw new Error(`cannot determine SDK path for "${store}"`);
  }
  if (store.startsWith('path:')) {
    root = store.slice(5);
    if (!path.isAbsolute(root)) {
      root = path.join(PROJECT_ROOT, root);
    }
    root = path.resolve(root);
    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true });
    }
    return root;
  }
  return root = store === 'inwasm' ? APP_ROOT : PROJECT_ROOT;
}

function loadConfig(filename: string): IConfig {
  return require(filename);
}


function isObj(item: any) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

function merge(target: IConfig, custom: IConfig): IConfig {
  if (isObj(target) && isObj(custom)) {
    for (const key in custom) {
      if (isObj(custom[key])) {
        if (!isObj(target[key])) {
          Object.assign(target, { [key]: {} });
        }
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
      if (k === path.length - 1) {
        o[lower] = value;
      } else {
        if (!o[lower]) o[lower] = {};
      }
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
  const configFile = path.join(PROJECT_ROOT, 'inwasm.config.cjs');
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
