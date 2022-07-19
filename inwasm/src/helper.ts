import * as fs from 'fs';


export function rmFolder(p: string) {
  try {
    fs.rmdirSync(p, { recursive: true });
  } catch (e) {
    try {
      fs.rmSync(p, { recursive: true });
    } catch (e) {}
  }
}
