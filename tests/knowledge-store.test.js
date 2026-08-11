'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ArticleStore, notebookToPromptText } = require('../src/article-store');
const { searchWorkspace } = require('../src/search');
const { SnippetStore } = require('../src/snippet-store');
const { computeStatistics } = require('../src/statistics');
const {
  ensureProblemWorkspace,
  recordProblemRun,
  saveSolutionSnapshot,
  setProblemStatus,
} = require('../src/workspace');

test('user snippets are created only from supplied source and are searchable', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'euler-knowledge-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snippets = new SnippetStore(root);

  await assert.rejects(() => snippets.add({ name: 'Empty', source: '   ' }), /empty cell/i);
  const saved = await snippets.add({
    name: 'My sieve',
    description: 'Written while solving a prime problem',
    tags: 'prime, sieve',
    source: 'def my_sieve(limit):\n    return [2, 3, 5]\n',
    sourceProblem: 10,
  });
  assert.equal(saved.id, 'snip001');
  assert.deepEqual(saved.tags, ['prime', 'sieve']);
  assert.match((await snippets.read(saved.id)).source, /my_sieve/);

  const results = await searchWorkspace(root, 'my_sieve');
  assert.equal(results.length, 1);
  assert.equal(results[0].kind, 'snippet');
  assert.equal(results[0].problemId, null);

  assert.equal(await snippets.remove(saved.id), true);
  assert.deepEqual(await snippets.list(), []);
});

test('search spans working notebooks, saved solutions and Markdown articles', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'euler-search-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const item = await ensureProblemWorkspace(root, 47);
  const notebook = JSON.parse(await fs.readFile(item.notebookPath, 'utf8'));
  notebook.cells[0].source = ['def distinct_factor_count(n):\n', '    return 4\n'];
  await fs.writeFile(item.notebookPath, `${JSON.stringify(notebook, null, 2)}\n`);
  await saveSolutionSnapshot(root, 47, { name: 'Factor counting' });

  const articles = new ArticleStore(root);
  await articles.create(47, {
    title: 'Factor analysis',
    markdown: '# Analysis\n\nThe distinct_factor_count helper expresses the core idea.\n',
    sources: [{ type: 'working-notebook', path: 'solution.ipynb' }],
  });

  const results = await searchWorkspace(root, 'distinct_factor_count');
  const kinds = new Set(results.map((item) => item.kind));
  assert.ok(kinds.has('working-notebook'));
  assert.ok(kinds.has('saved-solution'));
  assert.ok(kinds.has('article'));
  assert.ok(results.every((item) => item.problemId === 47));
});

test('articles remain independent editable Markdown artifacts and statistics are derived from local data', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'euler-article-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const item = await ensureProblemWorkspace(root, 3);
  const notebook = JSON.parse(await fs.readFile(item.notebookPath, 'utf8'));
  notebook.cells[0].source = ['answer = 6857\n'];
  await fs.writeFile(item.notebookPath, `${JSON.stringify(notebook, null, 2)}\n`);
  await saveSolutionSnapshot(root, 3, { name: 'Trial division' });
  await saveSolutionSnapshot(root, 3, { name: 'Prime factorization' });
  await setProblemStatus(root, 3, 'solved');
  await recordProblemRun(root, 3, 120);
  await recordProblemRun(root, 3, 90);

  const articleStore = new ArticleStore(root);
  const created = await articleStore.create(3, {
    title: 'Two approaches',
    markdown: '# Draft\n',
    sources: [{ type: 'saved-solution', id: 's001' }],
    model: 'mock-model',
  });
  const updated = await articleStore.update(3, created.id, {
    title: 'Two factorization approaches',
    markdown: '# Final\n\nExplanation.\n',
  });
  assert.equal(updated.id, 'a001');
  assert.match((await articleStore.read(3, 'a001')).markdown, /Explanation/);

  const snippets = new SnippetStore(root);
  await snippets.add({ name: 'Factor helper', source: 'def factors(n):\n    return []\n', sourceProblem: 3 });
  const stats = await computeStatistics(root, await snippets.list());
  assert.equal(stats.problemsStarted, 1);
  assert.equal(stats.solved, 1);
  assert.equal(stats.solutionCount, 2);
  assert.equal(stats.multiSolutionProblems, 1);
  assert.equal(stats.articleCount, 1);
  assert.equal(stats.snippetCount, 1);
  assert.equal(stats.runCount, 2);
  assert.equal(stats.medianLastRunMs, 90);

  const prompt = notebookToPromptText(notebook, 'User solution');
  assert.match(prompt, /User solution/);
  assert.match(prompt, /answer = 6857/);
});
