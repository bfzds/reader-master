import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const swPath = join(projectRoot, 'app_unpacked', 'src', 'sw.js');

const parseServiceWorker = source => {
  const listMatch = source.match(/const resourceList = \[(?<items>[\s\S]*?)\];/);
  if (!listMatch) throw new Error('resourceList declaration is missing');
  const resources = [...listMatch.groups.items.matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
  return resources;
};

const hashResources = resources => createHash('sha256')
  .update(JSON.stringify([...resources].sort()))
  .digest('hex')
  .slice(0, 12);

const getDatePrefix = () => {
  const date = new Date();
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
};

const source = await readFile(swPath, 'utf8');
const resources = parseServiceWorker(source);
const hash = hashResources(resources);
const versionMatch = source.match(/\/\* VERSION \*\/("(?<version>[^"]+)")\/\* VERSION \*\//);
if (!versionMatch) throw new Error('version markers are missing');

const currentVersion = versionMatch.groups.version;
const currentHash = currentVersion.match(/^\d{8}-(?<hash>[a-f0-9]{12})$/)?.groups.hash;
if (currentHash === hash) process.exit(0);

const nextVersion = `${getDatePrefix()}-${hash}`;
const nextSource = source.replace(
  /\/\* VERSION \*\/"[^"]+"\/\* VERSION \*\//,
  `/* VERSION */${JSON.stringify(nextVersion)}/* VERSION */`,
);
await writeFile(swPath, nextSource, 'utf8');
process.stdout.write(`Updated Service Worker version to ${nextVersion}\n`);
