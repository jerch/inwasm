import { APP_ROOT, PROJECT_ROOT, CONFIG, isPosix } from '../config';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { rmFolder } from '../helper';


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
  // FIXME: totally messed up atm. needs unified sdk handling for zig
  if (isPosix) {
    const tarball = path.join(basePath, 'sdk.xz');
    console.log(`[zig.run] Installing Zig "${versionString}"...`);
    cp.execSync(`curl --progress-bar -o ${tarball} ${version.tarball}`, { shell: '/bin/bash', stdio: 'inherit' });
    const shasum = cp.execSync(`shasum -a 256 ${tarball}`, { encoding: 'utf-8' });
    if (!shasum.includes(version.shasum)) throw new Error('download error - shasum does not match');
    cp.execSync(`tar -xf ${tarball} -C ${basePath}`);
    fs.unlinkSync(tarball);
    const subfolder = fs.readdirSync(basePath)[0];
    fs.symlinkSync(path.join(basePath, subfolder, 'zig'), path.join(basePath, 'zig'));
    console.log(`[zig.run] Finished.\n`);
  } else {
    // FIXME: not working yet properly, might need other unzip shim?
    console.log('grrrrr - would download again...');
    //return;
    const tarball = path.join(basePath, 'sdk.zip');
    console.log(version);
    console.log(`[zig.run] Installing Zig "${versionString}"...`);
    //cp.execSync(`curl --progress-bar -o ${tarball} ${version.tarball}`, { shell: 'cmd.exe', stdio: 'inherit' });
    //const shasum = cp.execSync(`shasum -a 256 ${tarball}`, { encoding: 'utf-8' });
    //if (!shasum.includes(version.shasum)) throw new Error('download error - shasum does not match');
    //cp.execSync(`tar -xf ${tarball} -C ${basePath}`);
    //TODO: place unzip here...
    cp.execSync(`c:\\Users\\jerch\\Desktop\\inwasm\\inwasm\\inwasm\\unzip ${tarball} -d ${basePath}`, { stdio: 'ignore' })
    return;
    //fs.unlinkSync(tarball);
    const subfolder = fs.readdirSync(basePath)[0];
    fs.symlinkSync(path.join(basePath, subfolder, 'zig'), path.join(basePath, 'zig'));
    console.log(`[zig.run] Finished.\n`);
  }
}


/**
 * Get the path to the zig binary.
 * The call evals the config settings and may try to install
 * the Zig sdk as stated from the config.
 */
// FIXME: windows support, test on macos
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
  if (fs.existsSync(basePath) && fs.existsSync(path.join(basePath, 'zig'))) {
    const installed = isPosix
      ? cp.execSync(`${path.join(basePath, 'zig')} version`, { encoding: 'utf-8' }).trim()
      // FIXME: bad hack, needs proper solution from above
      : cp.execSync(`${path.join(basePath, 'zig\\zig.exe')} version`, { encoding: 'utf-8' }).trim();
    if (version.tarball.indexOf(installed) !== -1) {
      return path.join(basePath, 'zig');
    }
    console.log(`[zig.run] Resolving version change "${installed}" --> "${zigConf.version}"`);
  }
  rmFolder(basePath);

  // install
  fs.mkdirSync(basePath, { recursive: true });
  downloadAndUnpack(basePath, version, zigConf.version);
  if (fs.existsSync(path.join(basePath, 'zig'))) {
    return path.join(basePath, 'zig');
  }
  throw new Error('cannot find zig binary');
}

