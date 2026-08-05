import { resolve } from 'node:path';
import { config as pocConfig } from '../poc/wdio.conf.mjs';

const projectRoot = resolve(import.meta.dirname, '..', '..');

export const config = {
  ...pocConfig,
  specs: [resolve(projectRoot, 'e2e/smoke/specs/**/*.spec.mjs')],
};
