import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';


const PATH_ENV_NAME = 'EMWASM_EMSDK';
const PATH_ENV_VERSION = 'EMWASM_EMSDK_VERSION';


const BASE_PATH = path.dirname(__dirname);


export function getSdkPath(): string {
  // FIXME: should support proper path indirection:
  // - 1st from config?
  // - 2nd from project folder
  // . 3rd from inwasm folder (also fallback)
  return process.env[PATH_ENV_NAME]
    ? path.resolve(process.env[PATH_ENV_NAME])
    : path.resolve(BASE_PATH, 'emsdk');
}


function getDefaultVersion(): string {
  // TODO: config file?
  return process.env[PATH_ENV_VERSION] || 'latest';
}


function isValidSdkPath(sdkPath: string): boolean {
  return fs.existsSync(path.join(sdkPath, 'emsdk.py'));
}


// checkout emsdk from repo (silent cmd of valid repo path)
export function checkout(): void {
  const sdkPath = getSdkPath();
  if (fs.existsSync(sdkPath)) {
    if (isValidSdkPath(sdkPath)) {
      console.log(`\n[sdk.checkout] ... skipped`);
      return;
    }
    throw new Error(`checkout: SDK path '${sdkPath}' does not contain a valid EMSDK installation`);
  }
  const parentPath = path.dirname(sdkPath);
  const wd = process.cwd();
  process.chdir(parentPath);
  const cmd = `git clone https://github.com/emscripten-core/emsdk.git ${path.basename(sdkPath)}`;
  console.log(`\n[sdk.checkout] ${cmd}`);
  cp.execSync(cmd, {shell: '/bin/bash', stdio: 'inherit'});
  process.chdir(wd);
}

// update emsdk
function update(): void {
  const wd = process.cwd();
  const sdkPath = getSdkPath();
  process.chdir(sdkPath);
  const cmd = 'git pull';
  console.log(`\n[sdk.update] ${cmd}`);
  cp.execSync(cmd, {shell: '/bin/bash', stdio: 'inherit'});
  process.chdir(wd);
}

// install and activate certain emscripten version
export function useVersion(version: string): void {
  const sdkPath = getSdkPath();
  if (!isValidSdkPath(sdkPath)) {
    throw new Error(`version: SDK path '${sdkPath}' does not contain a valid EMSDK installation`);
  }
  const cmd = `${sdkPath}/emsdk install ${version} && ${sdkPath}/emsdk activate ${version}`;
  console.log(`\n[sdk.version] ${cmd}`);
  cp.execSync(cmd, {shell: '/bin/bash', stdio: 'inherit'});
}

function bootstrap(version: string = 'latest'): void {
  checkout();
  useVersion(version);
}


// run a command within emsdk env
export function run(cmd: string) {
  const sdkPath = getSdkPath();
  if (!isValidSdkPath(sdkPath)) {
    bootstrap(getDefaultVersion());
  }
  console.log(`\n[sdk.run] ${cmd}`);
  const sdk = `source ${sdkPath}/emsdk_env.sh > /dev/null 2>&1`;
  cp.execSync(`${sdk} && ${cmd}`, {shell: '/bin/bash', stdio: 'inherit'});
}
