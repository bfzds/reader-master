import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptsDirectory);
const swPath = join(projectRoot, 'app_unpacked', 'src', 'sw.js');
const sourceRoot = join(projectRoot, 'app_unpacked', 'src');
const requiredResources = [
  './js/platform/import-folder.js',
  './js/platform/runtime.js',
  './js/data/migration-conflict.js',
  './js/data/migration-export.js',
  './js/data/migration-source.js',
  './js/data/settings-migration.js',
  './js/ui/util/debug-logger.js',
  './js/ui/util/debug-logger-core.js',
];

const readServiceWorker = async () => {
  const source = await readFile(swPath, 'utf8');
  const listMatch = source.match(/const resourceList = \[(?<items>[\s\S]*?)\];/);
  const versionMatch = source.match(/\/\* VERSION \*\/("[^"]+")\/\* VERSION \*\//);
  assert.ok(listMatch, 'resourceList declaration is missing');
  assert.ok(versionMatch, 'version markers are missing');
  const resources = [...listMatch.groups.items.matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
  return { source, resources, version: JSON.parse(versionMatch[1]) };
};

const resourceHash = resources => createHash('sha256')
  .update(JSON.stringify([...resources].sort()))
  .digest('hex')
  .slice(0, 12);

test('every Service Worker resource exists and required runtime modules are precached', async () => {
  const { resources } = await readServiceWorker();
  for (const resource of resources) {
    const filePath = join(sourceRoot, resource.replace(/^\.\//, ''));
    await assert.doesNotReject(stat(filePath), `missing precache resource: ${resource}`);
  }
  for (const resource of requiredResources) {
    assert.ok(resources.includes(resource), `required runtime module is not precached: ${resource}`);
  }
});

test('Service Worker version has the YYYYMMDD-resource-hash format', async () => {
  const { resources, version } = await readServiceWorker();
  assert.match(version, /^\d{8}-[a-f0-9]{12}$/);
  assert.equal(version.slice(-12), resourceHash(resources));
});
