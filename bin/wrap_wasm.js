const fs = require('fs');
const settings = require('../wasm/settings.json');

const content = [];
for ([k, v] of Object.entries(settings)) {
  if (k.startsWith('BYTES')) {
    content.push(`${k}: '${fs.readFileSync('wasm/'+v).toString('base64')}'`);
  } else if (typeof v === 'number') {
    content.push(`${k}: ${v}`);
  } else if (typeof v === 'string') {
    content.push(`${k}: '${v}'`);
  }
}

const file = `export const DATA = {
  ${content.join(',\n  ')}
};
`;
fs.writeFileSync('src/wasm.ts', file);
