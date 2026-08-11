'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  ensureProblemWorkspace,
  problemDirectoryName,
  relativeNotebookPath,
} = require('../src/workspace');

test('formats problem directories and notebook paths', () => {
  assert.equal(problemDirectoryName(1), '0001');
  assert.equal(problemDirectoryName(187), '0187');
  assert.equal(problemDirectoryName(12345), '12345');
  assert.equal(relativeNotebookPath(187), 'problems/0187/solution.ipynb');
});

test('creates a valid notebook and metadata once', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'euler-workspace-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const created = await ensureProblemWorkspace(root, 3);
  const notebook = JSON.parse(await fs.readFile(created.notebookPath, 'utf8'));
  const metadata1 = JSON.parse(await fs.readFile(created.metadataPath, 'utf8'));

  assert.equal(notebook.nbformat, 4);
  assert.equal(notebook.metadata.kernelspec.name, 'python3');
  assert.equal(notebook.metadata.kernelspec.display_name, 'Euler Python');
  assert.equal(metadata1.id, 3);

  notebook.cells[1].source = ['print(42)\n'];
  await fs.writeFile(created.notebookPath, `${JSON.stringify(notebook, null, 2)}\n`);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await ensureProblemWorkspace(root, 3);

  const notebook2 = JSON.parse(await fs.readFile(created.notebookPath, 'utf8'));
  const metadata2 = JSON.parse(await fs.readFile(created.metadataPath, 'utf8'));
  assert.deepEqual(notebook2.cells[1].source, ['print(42)\n']);
  assert.equal(metadata2.created, metadata1.created);
  assert.notEqual(metadata2.lastOpened, undefined);
});
