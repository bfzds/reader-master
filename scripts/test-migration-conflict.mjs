import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMigrationConflictResolver,
  getMigrationConflictDialogResult,
} from '../app_unpacked/src/js/data/migration-conflict.js';

test('复用选择会自动使用后续候选列表中的相同编号', async () => {
  let prompts = 0;
  const resolveConflict = createMigrationConflictResolver(async () => {
    prompts++;
    return { index: 1, applyToRemaining: true };
  });

  const first = await resolveConflict({ candidates: [{ id: 'a' }, { id: 'b' }] });
  const second = await resolveConflict({ candidates: [{ id: 'c' }, { id: 'd' }] });

  assert.equal(first.id, 'b');
  assert.equal(second.id, 'd');
  assert.equal(prompts, 1);
});

test('复用编号超过候选数量时会重新询问', async () => {
  const answers = [
    { index: 2, applyToRemaining: true },
    { index: 0, applyToRemaining: false },
  ];
  let prompts = 0;
  const resolveConflict = createMigrationConflictResolver(async () => {
    prompts++;
    return answers.shift();
  });

  await resolveConflict({ candidates: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
  const second = await resolveConflict({ candidates: [{ id: 'd' }] });

  assert.equal(second.id, 'd');
  assert.equal(prompts, 2);
});

test('一次性选择不会继续复用旧编号', async () => {
  const answers = [
    { index: 1, applyToRemaining: true },
    { index: 0, applyToRemaining: false },
    { index: 1, applyToRemaining: false },
  ];
  let prompts = 0;
  const resolveConflict = createMigrationConflictResolver(async () => {
    prompts++;
    return answers.shift();
  });

  await resolveConflict({ candidates: [{ id: 'a' }, { id: 'b' }] });
  await resolveConflict({ candidates: [{ id: 'c' }] });
  await resolveConflict({ candidates: [{ id: 'd' }, { id: 'e' }] });

  assert.equal(prompts, 3);
});

test('对话框的复用按钮返回当前编号和复用标记', () => {
  assert.deepEqual(getMigrationConflictDialogResult('apply', 1, 2), {
    index: 1,
    applyToRemaining: true,
  });
});

test('取消和越界编号不会返回候选选择', () => {
  assert.equal(getMigrationConflictDialogResult('cancel', 0, 1), null);
  assert.equal(getMigrationConflictDialogResult('once', 2, 2), null);
});
