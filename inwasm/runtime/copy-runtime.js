import fs from 'node:fs';
import { join } from 'node:path';

const FILES = ['index.cjs', 'index.d.ts', 'index.js'];

if (fs.existsSync('lib')) fs.rmSync('lib', {recursive: true});
fs.mkdirSync('lib', { recursive: true });
for (const filename of FILES) {
  fs.copyFileSync(join('..', 'lib', filename), join('lib', filename));
}
