import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..', '..');

export const config = {
  runner: 'local',
  specs: [resolve(projectRoot, 'e2e/poc/specs/**/*.spec.mjs')],
  maxInstances: 1,
  services: [['@wdio/tauri-service', {
    appBinaryPath: resolve(projectRoot, 'src-tauri/target/debug/treader-shell.exe'),
    driverProvider: 'embedded',
    captureBackendLogs: true,
    captureFrontendLogs: true,
    logDir: resolve(projectRoot, 'artifacts/e2e-poc/logs'),
    startTimeout: 60000,
    statusPollTimeout: 5000,
  }]],
  capabilities: [{
    browserName: 'tauri',
    'tauri:options': {
      application: resolve(projectRoot, 'src-tauri/target/debug/treader-shell.exe'),
    },
  }],
  logLevel: 'info',
  bail: 1,
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 1,
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
  reporters: ['spec'],
  baseUrl: 'http://127.0.0.1:2333',
};
