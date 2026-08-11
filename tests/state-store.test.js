'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { StateStore, sanitizeState } = require('../src/state-store');

test('sanitizes split ratio and ids', () => {
  assert.equal(sanitizeState({ splitRatio: 9 }).splitRatio, 0.8);
  assert.equal(sanitizeState({ splitRatio: 0 }).splitRatio, 0.2);
  assert.equal(sanitizeState({ lastNotebookProblemId: -1 }).lastNotebookProblemId, null);
});

test('persists state atomically', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'euler-state-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'state.json');
  const store = new StateStore(file);
  await store.load();
  await store.patch({ lastNotebookProblemId: 99, splitRatio: 0.6 });

  const reloaded = new StateStore(file);
  const state = await reloaded.load();
  assert.equal(state.lastNotebookProblemId, 99);
  assert.equal(state.splitRatio, 0.6);
});
