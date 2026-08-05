import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const projectRoot = resolve(import.meta.dirname, '..', '..');
const suite = process.argv.includes('--suite')
  ? process.argv[process.argv.indexOf('--suite') + 1]
  : 'poc';
const tauriCli = join(projectRoot, 'node_modules/@tauri-apps/cli/tauri.js');
const wdioCli = join(projectRoot, 'node_modules/@wdio/cli/bin/wdio.js');
const staticServerScript = join(projectRoot, 'scripts/serve.cjs');
const wdioConfigPath = suite === 'smoke'
  ? join(projectRoot, 'e2e', 'smoke', 'wdio.conf.mjs')
  : join(projectRoot, 'e2e', 'poc', 'wdio.conf.mjs');
const frontendSourceRoot = join(projectRoot, 'app_unpacked', 'src');
const guestPluginSource = join(projectRoot, 'node_modules', '@wdio', 'tauri-plugin', 'dist-js', 'index.js');
const artifactsRoot = resolve(projectRoot, 'artifacts/e2e-poc');
const diagnosticsRoot = join(artifactsRoot, 'diagnostics');
const tempRoot = await mkdtemp(join(tmpdir(), 'treader-e2e-poc-'));
const dataRoot = join(tempRoot, 'app-data');
const localDataRoot = join(tempRoot, 'local-app-data');
const tempWorkRoot = join(tempRoot, 'temp');
const importRoot = join(tempRoot, 'import');
const frontendRoot = join(tempRoot, 'frontend');
const markerPath = join(tempRoot, 'cleanup-marker.txt');
const runId = tempRoot.split(/[\\/]/).pop().toLowerCase().replace(/[^a-z0-9]/g, '');
const identifier = `io.github.tiansh.reader.e2e.poc.${runId}`;
const pocConfigPath = join(tempRoot, 'tauri.poc.conf.json');

await mkdir(dataRoot, { recursive: true });
await mkdir(localDataRoot, { recursive: true });
await mkdir(tempWorkRoot, { recursive: true });
await mkdir(importRoot, { recursive: true });
await cp(frontendSourceRoot, frontendRoot, { recursive: true });
const frontendIndexPath = join(frontendRoot, 'index.html');
const frontendIndex = await readFile(frontendIndexPath, 'utf8');
await writeFile(
  frontendIndexPath,
  frontendIndex.replace(
    '</head>',
    '<script type="module" src="./wdio-tauri-plugin.js"></script>\n</head>',
  ),
  'utf8',
);
await writeFile(join(frontendRoot, 'wdio-tauri-plugin.js'), await readFile(guestPluginSource), 'utf8');
await mkdir(diagnosticsRoot, { recursive: true });
await writeFile(markerPath, 'created by e2e poc\n', 'utf8');
const fixturePath = join(importRoot, 'e2e-smoke.txt');
if (suite === 'smoke') {
  await writeFile(fixturePath, 'E2E TXT Smoke Book\nE2E TXT smoke content.\n', 'utf8');
}
await writeFile(pocConfigPath, JSON.stringify({
  identifier,
  app: {
    security: {
      capabilities: [
        'main-capability',
        {
          identifier: 'e2e-wdio-capability',
          description: 'PoC-only WebDriver capability.',
          windows: ['main'],
          remote: {
            urls: ['http://127.0.0.1:2333/**'],
          },
          permissions: ['wdio-webdriver:default'],
        },
      ],
    },
  },
  bundle: { active: false },
}, null, 2), 'utf8');

function assertOwnedPath(path) {
  const normalizedRoot = resolve(tempRoot) + '\\';
  const normalizedPath = resolve(path);
  if (normalizedPath !== resolve(tempRoot) && !normalizedPath.startsWith(normalizedRoot)) {
    throw new Error(`Refusing cleanup outside dedicated temp root: ${normalizedPath}`);
  }
}

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', chunk => stdout.push(chunk));
  child.stderr.on('data', chunk => stderr.push(chunk));
  const closed = new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('close', code => resolvePromise({
      code,
      stdout: Buffer.concat(stdout),
      stderr: Buffer.concat(stderr),
    }));
  });
  return { child, closed, stdout, stderr };
}

function run(command, args, options = {}) {
  return spawnProcess(command, args, options).closed;
}

async function waitForPort(port, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const available = await new Promise(resolvePromise => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolvePromise(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolvePromise(false);
      });
    });
    if (available) return;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for 127.0.0.1:${port}`);
}

async function writeDiagnostics(result, serverResult, error) {
  if (result) {
    await writeFile(join(diagnosticsRoot, 'wdio.stdout.log'), result.stdout);
    await writeFile(join(diagnosticsRoot, 'wdio.stderr.log'), result.stderr);
  }
  if (serverResult) {
    await writeFile(join(diagnosticsRoot, 'server.stdout.log'), Buffer.concat(serverResult.stdout));
    await writeFile(join(diagnosticsRoot, 'server.stderr.log'), Buffer.concat(serverResult.stderr));
  }
  if (error) await writeFile(join(diagnosticsRoot, 'runner-error.log'), `${error}\n`, 'utf8');
  await writeFile(join(diagnosticsRoot, 'isolation.json'), JSON.stringify({
    origin: 'http://127.0.0.1:2333',
    identifier,
    tempRoot,
    dataRoot,
    localDataRoot,
    tempWorkRoot,
    importRoot,
    cleanupTarget: tempRoot,
  }, null, 2));
}

let result;
let server;
const testEnv = {
  APPDATA: dataRoot,
  LOCALAPPDATA: localDataRoot,
  TEMP: tempWorkRoot,
  TMP: tempWorkRoot,
    TAURI_E2E_DATA_ROOT: dataRoot,
    TAURI_E2E_IMPORT_ROOT: importRoot,
    TAURI_E2E_FRONTEND_ROOT: frontendRoot,
    TAURI_E2E_FIXTURE_PATH: fixturePath,
  };
try {
  const build = await run(process.execPath, [
    tauriCli, 'build', '--debug', '--no-bundle', '--ci',
    '--features', 'e2e-webdriver',
    '--config', 'src-tauri/tauri.conf.json',
    '--config', pocConfigPath,
  ]);
  if (build.code !== 0) {
    result = build;
    throw new Error(`Tauri debug build failed with exit code ${build.code}`);
  }

  server = spawnProcess(process.execPath, [staticServerScript], { env: testEnv });
  await waitForPort(2333);

  result = await run(process.execPath, [wdioCli, 'run', wdioConfigPath], { env: testEnv });
  await writeDiagnostics(result, server);
  if (result.code !== 0) {
    throw new Error(`WebDriver PoC failed with exit code ${result.code}`);
  }
  console.log('E2E_POC_RESULT=FEASIBLE');
  console.log(`Diagnostics: ${diagnosticsRoot}`);
} catch (error) {
  await writeDiagnostics(result, server, error instanceof Error ? error.stack : String(error));
  console.error(`E2E_POC_RESULT=NOT_FEASIBLE`);
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`Diagnostics: ${diagnosticsRoot}`);
  process.exitCode = 1;
} finally {
  if (server && !server.child.killed) {
    server.child.kill();
    await Promise.race([server.closed, new Promise(resolvePromise => setTimeout(resolvePromise, 2000))]);
  }
  assertOwnedPath(tempRoot);
  await rm(tempRoot, { recursive: true, force: true });
}
