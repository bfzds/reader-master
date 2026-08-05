import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const readText = relativePath => readFile(join(projectRoot, relativePath), 'utf8');
const extractInlineCsp = (source, pattern) => source.match(pattern)?.[1] || null;
const normalize = value => value.trim().replace(/\s+/g, ' ');
const connectSource = value => value.match(/connect-src\s+([^;]+)/)?.[1] || '';
const withoutConnectSource = value => value.replace(/connect-src\s+[^;]+/, 'connect-src <mode-specific>');

test('development and production CSP sources are internally consistent', async () => {
  const [devFile, prodFile, serveSource, shellSource, tauriSource] = await Promise.all([
    readText('config/csp-dev.txt'),
    readText('config/csp-prod.txt'),
    readText('scripts/serve.cjs'),
    readText('src-tauri/src/shell.rs'),
    readText('src-tauri/tauri.conf.json'),
  ]);
  const config = JSON.parse(tauriSource);
  const dev = normalize(devFile);
  const prod = normalize(prodFile);
  const serve = extractInlineCsp(serveSource, /CONTENT_SECURITY_POLICY\s*=\s*["']([^"']+)["']/);
  const shell = extractInlineCsp(shellSource, /CONTENT_SECURITY_POLICY:\s*&str\s*=\s*["']([^"']+)["']/);
  const tauri = normalize(config.app.security.csp);

  assert.equal(withoutConnectSource(dev), withoutConnectSource(prod));
  assert.match(connectSource(dev), /http:\/\/ipc\.localhost/);
  assert.match(connectSource(prod), /http:\/\/ipc\.localhost/);
  if (serve) assert.equal(normalize(serve), dev);
  if (shell) assert.equal(normalize(shell), prod);
  assert.equal(tauri, prod);
  assert.match(serveSource, /['"]\.mjs['"]\s*:\s*['"]text\/javascript; charset=UTF-8['"]/);
});
