import { InWasm, OutputMode, OutputType } from 'inwasm';


export const custom = InWasm({
  name: 'custom',
  type: OutputType.INSTANCE,
  mode: OutputMode.SYNC,
  srctype: 'custom',
  customRunner: (def, buildDir) => {
    const cp = require('child_process');
    const fs = require('fs');
    //cp.execSync('cd custom && ./build.sh', { shell: '/bin/bash', stdio: 'inherit' });
    cp.execSync('cd custom && build.bat', { shell: 'cmd.exe', stdio: 'inherit' });
    return fs.readFileSync('custom/module.wasm');
  },
  exports: {
    add: (a: number, b: number) => 0
  },
  code: ''
})();


// basic test
console.log('custom module:', custom.exports);
console.log('custom module add 23 + 42:', custom.exports.add(23, 42));
