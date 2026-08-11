'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  ensureProblemWorkspace,
  listProblems,
  listSolutions,
  problemDirectoryName,
  recordProblemRun,
  relativeNotebookPath,
  saveSolutionSnapshot,
  setProblemStatus,
} = require('../src/workspace');

test('formats problem directories and notebook paths', () => {
  assert.equal(problemDirectoryName(1), '0001');
  assert.equal(problemDirectoryName(187), '0187');
  assert.equal(problemDirectoryName(12345), '12345');
  assert.equal(relativeNotebookPath(187), 'problems/0187/solution.ipynb');
});

test('creates a minimal working notebook and never rewrites existing notebook content', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'euler-workspace-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const created = await ensureProblemWorkspace(root, 3);
  const notebook = JSON.parse(await fs.readFile(created.notebookPath, 'utf8'));
  const metadata1 = JSON.parse(await fs.readFile(created.metadataPath, 'utf8'));

  assert.equal(notebook.nbformat, 4);
  assert.equal(notebook.metadata.kernelspec.name, 'python3');
  assert.equal(notebook.metadata.kernelspec.display_name, 'Euler Python');
  assert.equal(notebook.metadata.eulerWorkbench.problemId, 3);
  assert.equal(notebook.cells.length, 1);
  assert.equal(notebook.cells[0].cell_type, 'code');
  assert.deepEqual(notebook.cells[0].source, []);
  assert.equal(metadata1.id, 3);
  assert.equal(metadata1.status, 'in_progress');

  notebook.cells[0].source = ['print(42)\n'];
  await fs.writeFile(created.notebookPath, `${JSON.stringify(notebook, null, 2)}\n`);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await ensureProblemWorkspace(root, 3);

  const notebook2 = JSON.parse(await fs.readFile(created.notebookPath, 'utf8'));
  const metadata2 = JSON.parse(await fs.readFile(created.metadataPath, 'utf8'));
  assert.deepEqual(notebook2.cells[0].source, ['print(42)\n']);
  assert.equal(metadata2.created, metadata1.created);
  assert.ok(metadata2.lastOpened);
});

test('solution snapshots use stable ids and do not replace the working notebook', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'euler-solutions-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const item = await ensureProblemWorkspace(root, 10);
  const notebook = JSON.parse(await fs.readFile(item.notebookPath, 'utf8'));
  notebook.cells[0].source = ['answer = 23\n'];
  await fs.writeFile(item.notebookPath, `${JSON.stringify(notebook, null, 2)}\n`);

  const first = await saveSolutionSnapshot(root, 10, { name: 'Brute force', tags: 'loops, baseline' });
  notebook.cells[0].source = ['answer = 42\n'];
  await fs.writeFile(item.notebookPath, `${JSON.stringify(notebook, null, 2)}\n`);
  const second = await saveSolutionSnapshot(root, 10, { name: 'Number theory' });

  assert.equal(first.id, 's001');
  assert.equal(second.id, 's002');
  assert.deepEqual(first.tags, ['loops', 'baseline']);
  const solutions = await listSolutions(root, 10);
  assert.equal(solutions.length, 2);
  const savedFirst = JSON.parse(await fs.readFile(path.join(item.dir, 'solutions', 's001.ipynb'), 'utf8'));
  const working = JSON.parse(await fs.readFile(item.notebookPath, 'utf8'));
  assert.deepEqual(savedFirst.cells[0].source, ['answer = 23\n']);
  assert.deepEqual(working.cells[0].source, ['answer = 42\n']);
});

test('problem status and Run All metadata feed the dashboard', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'euler-dashboard-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await ensureProblemWorkspace(root, 7);
  await setProblemStatus(root, 7, 'solved');
  await recordProblemRun(root, 7, 812.7);
  const problems = await listProblems(root);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].status, 'solved');
  assert.equal(problems[0].runCount, 1);
  assert.equal(problems[0].lastRun.durationMs, 813);
});
