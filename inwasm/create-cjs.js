import fs from 'node:fs';
import { join } from 'node:path';


fs.mkdirSync('src-cjs', { recursive: true });
fs.copyFileSync(join('src', 'index.ts'), join('src-cjs', 'index.ts'));
fs.copyFileSync(join('src', 'mocha_shim.ts'), join('src-cjs', 'mocha_shim.ts'));
