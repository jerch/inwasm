/**
 * Copyright (c) 2022, 2026 Joerg Breitbart
 * @license MIT
 */

import * as cp from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { APP_ROOT, PROJECT_ROOT, CONFIG, isPosix, SHELL } from '../config.js';
import { rmFolder } from '../helper.js';


function sha256(content: Buffer) {  
  return createHash('sha256').update(content).digest('hex');
}


interface IDownloadVersion {
  tarball: string;
  shasum: string;
  size: string;
}

interface InstallableVersions {
  [key: string]: IDownloadVersion;
}


// map nodejs arch|platform to Zig naming scheme
const ARCH_MAP: any = {
  'arm': 'armv7a',
  'arm64': 'aarch64',
  'ia32': 'i386',
  'mips': '#',
  'mipsel': '#',
  'ppc': '#',
  'ppc64': '#',
  's390': '#',
  's390x': '#',
  'x64': 'x86_64'
};
const PLATFORM_MAP: any = {
  'aix': '#',
  'darwin': 'macos',
  'freebsd': 'freebsd',
  'linux': 'linux',
  'openbsd': '#',
  'sunos': '#',
  'win32': 'windows'
};


function getDownloadInfo(): any {
  const data = cp.execSync('curl -s https://ziglang.org/download/index.json', { encoding: 'utf-8' });
  return JSON.parse(data);
}


function getUsableVersions(): any {
  const arch = process.arch;
  const platform = process.platform;
  const zigPlatform = `${ARCH_MAP[arch]}-${PLATFORM_MAP[platform]}`;
  console.log(`[zig.run] ARCH: ${arch}, PLATFORM: ${platform} --> ${zigPlatform}`);
  const downloadInfo = getDownloadInfo();
  const versions: InstallableVersions = {};
  for (const version of Object.keys(downloadInfo)) {
    if (downloadInfo[version][zigPlatform]) {
      versions[version] = downloadInfo[version][zigPlatform];
    }
  }
  console.log(`[zig.run] Usable Zig versions: [${Object.keys(versions).join(', ')}]`);
  return versions;
}


function downloadAndUnpack(basePath: string, version: IDownloadVersion, versionString: string) {
  const tarball = path.join(basePath, isPosix ? 'sdk.xz' : 'sdk.zip');
  console.log(`[zig.run] Installing Zig "${versionString}"...`);
  cp.execSync(`curl --progress-bar -o ${tarball} ${version.tarball}`, { shell: SHELL, stdio: 'inherit' });
  if (sha256(fs.readFileSync(tarball)) !== version.shasum) throw new Error('download error - shasum does not match');
  if (isPosix) {
    cp.execSync(`tar -xf ${tarball} -C ${basePath}`);
  } else {
    cp.execSync(`${path.join(APP_ROOT, 'exe', 'unzip.exe')} "${tarball}" -d "${basePath}"`, { stdio: 'ignore' });
  }
  fs.unlinkSync(tarball);
  const subfolder = fs.readdirSync(basePath)[0];
  if (isPosix) {
    fs.symlinkSync(path.join(basePath, subfolder, 'zig'), path.join(basePath, 'zig'));
  } else {
    fs.symlinkSync(path.join(basePath, subfolder), path.join(basePath, 'current'));
  }
  console.log(`[zig.run] Finished.\n`);
}


function localZigBinary(basePath: string): string {
  return isPosix ? path.join(basePath, 'zig') : path.join(basePath, 'current', 'zig.exe');
}


/**
 * Get the path to the zig binary.
 * The call evals the config settings and may try to install
 * the Zig sdk as stated from the config.
 */
export function getZigBinary(): string {
  const zigConf = CONFIG.zig as any;
  if (zigConf && zigConf.hasOwnProperty('binary')) {
    // from preinstalled
    const zigPath = zigConf.binary;
    return zigPath === '$PATH' ? 'zig' : zigPath;
  }

  // requested version
  const versions = getUsableVersions();
  console.log(`[zig.run] Requested version: "${zigConf.version}"`);
  const version: IDownloadVersion = versions[zigConf.version];
  if (!version) throw new Error(`zig version ${zigConf.version} not found for your system`);

  // from autoinstalled
  const basePath = path.join(zigConf.store === 'inwasm' ? APP_ROOT : PROJECT_ROOT, 'inwasm-sdks', 'zig');
  const localZig = localZigBinary(basePath);
  if (fs.existsSync(basePath) && fs.existsSync(localZig)) {
    const installed = cp.execSync(`${localZig} version`, { encoding: 'utf-8' }).trim();
    if (version.tarball.indexOf(installed) !== -1) {
      return localZig;
    }
    console.log(`[zig.run] Resolving version change "${installed}" --> "${zigConf.version}"`);
  }
  rmFolder(basePath);

  // install
  fs.mkdirSync(basePath, { recursive: true });
  downloadAndUnpack(basePath, version, zigConf.version);
  if (fs.existsSync(localZig)) {
    return localZig;
  }
  throw new Error('cannot find zig binary');
}
