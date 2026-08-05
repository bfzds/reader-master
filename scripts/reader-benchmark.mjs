import os from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { joinText, splitText, textByteLength } from '../app_unpacked/src/js/data/storage-chunks.js';

const sizes = [
  ['small', 100 * 1024, 3],
  ['medium', 5 * 1024 * 1024, 3],
  ['large', 50 * 1024 * 1024, 1],
];
const pattern = 'tReader benchmark line 0123456789\n';

const makeText = byteTarget => {
  const repeats = Math.ceil(byteTarget / Buffer.byteLength(pattern, 'utf8'));
  return pattern.repeat(repeats).slice(0, byteTarget);
};

const percentile = (values, rank) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * rank) - 1)];
};

const measure = (name, text, iterations) => {
  const samples = [];
  let peak = { rss: 0, heapUsed: 0, external: 0 };
  let chunkCount = 0;
  let joinedLength = 0;
  for (let index = 0; index < iterations; index++) {
    const start = performance.now();
    const chunks = splitText(text);
    const joined = joinText(chunks);
    const elapsedMs = performance.now() - start;
    samples.push(Number(elapsedMs.toFixed(3)));
    chunkCount = chunks.length;
    joinedLength = joined.length;
    const memory = process.memoryUsage();
    peak = {
      rss: Math.max(peak.rss, memory.rss),
      heapUsed: Math.max(peak.heapUsed, memory.heapUsed),
      external: Math.max(peak.external, memory.external),
    };
  }
  return {
    name,
    inputBytes: textByteLength(text),
    inputChars: text.length,
    iterations,
    chunkCount,
    joinedLength,
    samplesMs: samples,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    peakMemoryBytes: peak,
  };
};

const results = sizes.map(([name, byteTarget, iterations]) => measure(name, makeText(byteTarget), iterations));
const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpu: os.cpus()[0]?.model || 'unknown',
  cpuCount: os.cpus().length,
  totalMemoryBytes: os.totalmem(),
  results,
};
const outputPath = process.env.BENCHMARK_OUTPUT || 'artifacts/benchmark/latest.json';
await mkdir(dirname(resolve(outputPath)), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
