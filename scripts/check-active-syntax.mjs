import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const sourceRoot = join(import.meta.dirname, '..', 'app_unpacked', 'src');

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJavaScriptFiles(path));
    } else if (entry.isFile() && /\.m?js$/i.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const files = (await collectJavaScriptFiles(sourceRoot)).sort();
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) failed++;
}

if (failed) {
  console.error(`JavaScript syntax failures: ${failed}`);
  process.exitCode = 1;
} else {
  console.log(`Checked active JavaScript files: ${files.length}`);
}
