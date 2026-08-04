const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workerPath = path.join(__dirname, '..', 'app_unpacked', 'src', 'worker', 'toc.js');
const workerCode = fs.readFileSync(workerPath, 'utf8');

const recognize = function (content) {
  let handler = null;
  let result = undefined;
  const context = {
    console,
    postMessage: value => { result = value; },
    self: {
      addEventListener: (name, listener) => {
        if (name === 'message') handler = listener;
      },
    },
  };
  vm.runInNewContext(workerCode, context, { filename: workerPath });
  assert.equal(typeof handler, 'function', '目录 Worker 必须注册 message 事件');
  handler({ data: content });
  return result;
};

const englishChapters = recognize([
  'Chapter 1: Arrival',
  'The first chapter body.',
  '',
  'Chapter 2: Departure',
  'The second chapter body.',
].join('\n'));
assert.equal(englishChapters?.items?.length, 2, '两章英文小说应由通用预设生成目录');
assert.match(englishChapters?.template ?? '', /chapter/i, '应保存命中的英文目录规则');

const chineseChapters = recognize([
  '楔子',
  'An opening.',
  '',
  '第一章 初见',
  'The first chapter body.',
].join('\n'));
assert.equal(chineseChapters?.items?.length, 2, '中文特殊章节与章节标题应由通用预设生成目录');

const longPlainText = recognize('甲'.repeat(40_001));
assert.equal(longPlainText?.template, '', '无章节标题时应标记为自动分段目录');
assert.equal(longPlainText?.items?.length, 1, '超过 40,000 字的正文应至少分出第二段');
assert.equal(longPlainText?.items?.[0]?.cursor, 40_000, '自动分段的最大长度应为 40,000 字');

const paragraphFallback = recognize(Array.from({ length: 81 }, (_, index) => `第${index + 1}段正文`).join('\n'));
const paragraphBoundary = paragraphFallback?.items?.[0]?.cursor ?? 0;
assert.ok(paragraphBoundary > 0, '达到 80 段正文时应生成第二段');
assert.equal(paragraphFallback?.template, '', '按段落分段也应标记为自动分段目录');

console.log('PASS: TXT 目录预设与 40,000 字自动分段');
