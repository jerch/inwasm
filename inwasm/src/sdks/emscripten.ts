import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { rmFolder } from '../helper';

import { APP_ROOT, PROJECT_ROOT, CONFIG, SHELL, isPosix } from '../config';


/**
 * Get the path to the emscripten SDK.
 * The call evals the config settings and may try to install
 * the SDK as stated from the config.
 */
// FIXME: make it possible to activate a different version once installed
// FIXME: make 'latest' somehow updateable
export function getEmscriptenPath(): string {
  const emsdkConf = CONFIG.emsdk as any;
  if (emsdkConf && emsdkConf.hasOwnProperty('path')) {
    // from preinstalled
    return emsdkConf.path;
  }

  // from autoinstalled
  const basePath = path.join(emsdkConf.store === 'inwasm' ? APP_ROOT : PROJECT_ROOT, 'inwasm-sdks', 'emsdk');
  if (fs.existsSync(basePath) && fs.existsSync(path.join(basePath, 'emsdk.py'))) {
    return basePath;
  }
  rmFolder(basePath);

  // install
  fs.mkdirSync(path.dirname(basePath), { recursive: true });
  console.log(`\n[emscripten.checkout] Cloning emscripten...`);
  cp.execSync(`git clone https://github.com/emscripten-core/emsdk.git ${basePath}`, {shell: SHELL, stdio: 'inherit'});
  console.log(`\n[emscripten.version] Activate version: "${emsdkConf.version}"`);
  cp.execSync(
    `${basePath}/emsdk install ${emsdkConf.version} && ${basePath}/emsdk activate ${emsdkConf.version}`,
    {shell: SHELL, stdio: 'inherit'}
  );

  return basePath;
}


/**
 * Return the bin/ path of the embedded clang version.
 */
export function getClangBinPath(): string {
  return path.join(getEmscriptenPath(), 'upstream', 'bin');
}


/**
 * Run the given command in the emscripten env.
 * 
 * Commands like `emcc` can be used directly (implicitly added to PATH by env script).
 * To run executables of the embedded clang version, use `getClangBinPath()` to get a
 * hold of clang's bin/ folder.
 */
export function emscriptenRun(cmd: string) {
  const sdkPath = getEmscriptenPath();
  console.log(`\n[emscripten.run] ${cmd}`);
  if (isPosix) {
    const sdk = `source ${sdkPath}/emsdk_env.sh > /dev/null 2>&1`;
    cp.execSync(`${sdk} && ${cmd}`, {shell: SHELL, stdio: 'inherit'});
  } else {
    // FIXME: something is messed up here - emcc is not in path?
    const sdk = path.join(sdkPath, 'emsdk_env.bat');
    cp.execSync(`${sdk} && ${cmd}`, {shell: 'cmd.exe', stdio: 'inherit'});
  }
}
