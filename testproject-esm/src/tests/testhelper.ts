import * as fs from 'node:fs';
import * as path from 'node:path';


export function watExportMemory(WAT_PATH: string, unit: string): string {
  const content = fs.readFileSync(path.join(WAT_PATH, unit, 'final.wat'), {encoding: 'utf-8'});
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('(memory (;')) {
      return trimmed;
    }
  }
  throw new Error('(memory) entry not found in wat');
}

export function watImportMemory(WAT_PATH: string, unit: string): string {
  const content = fs.readFileSync(path.join(WAT_PATH, unit, 'final.wat'), {encoding: 'utf-8'});
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('(import "env" "memory"')) {
      return trimmed;
    }
  }
  throw new Error('(memory) entry not found in wat');
}
