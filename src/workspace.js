'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const PROBLEM_STATUSES = new Set(['not_started', 'in_progress', 'solved']);

function problemDirectoryName(problemId) {
  if (!Number.isSafeInteger(problemId) || problemId <= 0) {
    throw new TypeError('problemId must be a positive safe integer');
  }
  return String(problemId).padStart(4, '0');
}

function relativeNotebookPath(problemId) {
  return path.posix.join('problems', problemDirectoryName(problemId), 'solution.ipynb');
}

function absoluteNotebookPath(workspaceRoot, problemId) {
  return path.join(workspaceRoot, 'problems', problemDirectoryName(problemId), 'solution.ipynb');
}

function makeNotebook(problemId) {
  return {
    cells: [
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [],
      },
    ],
    metadata: {
      kernelspec: {
        display_name: 'Euler Python',
        language: 'python',
        name: 'python3',
      },
      language_info: { name: 'python' },
      eulerWorkbench: {
        schemaVersion: 1,
        problemId,
        canonicalUrl: `https://projecteuler.net/problem=${problemId}`,
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
}

function problemPaths(workspaceRoot, problemId) {
  const dir = path.join(workspaceRoot, 'problems', problemDirectoryName(problemId));
  return {
    dir,
    notebookPath: path.join(dir, 'solution.ipynb'),
    metadataPath: path.join(dir, 'problem.json'),
    solutionsDir: path.join(dir, 'solutions'),
    solutionsIndexPath: path.join(dir, 'solutions.json'),
    articlesDir: path.join(dir, 'articles'),
  };
}

function normalizeProblemMetadata(problemId, raw = {}, now = new Date().toISOString()) {
  const status = PROBLEM_STATUSES.has(raw.status) ? raw.status : 'in_progress';
  return {
    ...raw,
    schemaVersion: 2,
    id: problemId,
    url: `https://projecteuler.net/problem=${problemId}`,
    created: typeof raw.created === 'string' ? raw.created : now,
    lastOpened: typeof raw.lastOpened === 'string' ? raw.lastOpened : now,
    status,
    solutionCount: Number.isSafeInteger(raw.solutionCount) && raw.solutionCount >= 0 ? raw.solutionCount : 0,
    runCount: Number.isSafeInteger(raw.runCount) && raw.runCount >= 0 ? raw.runCount : 0,
    lastRun: raw.lastRun && typeof raw.lastRun === 'object' ? raw.lastRun : null,
  };
}

async function readProblemMetadata(workspaceRoot, problemId) {
  const { metadataPath } = problemPaths(workspaceRoot, problemId);
  const raw = await readJson(metadataPath, {});
  return normalizeProblemMetadata(problemId, raw || {});
}

async function updateProblemMetadata(workspaceRoot, problemId, partial) {
  const { metadataPath } = problemPaths(workspaceRoot, problemId);
  const existing = await readProblemMetadata(workspaceRoot, problemId);
  const next = normalizeProblemMetadata(problemId, { ...existing, ...partial });
  await writeJsonAtomic(metadataPath, next);
  return next;
}

async function ensureProblemWorkspace(workspaceRoot, problemId) {
  const paths = problemPaths(workspaceRoot, problemId);
  await fs.mkdir(paths.dir, { recursive: true });

  if (!(await pathExists(paths.notebookPath))) {
    await writeJsonAtomic(paths.notebookPath, makeNotebook(problemId));
  }

  const now = new Date().toISOString();
  const existing = await readJson(paths.metadataPath, {});
  const metadata = normalizeProblemMetadata(problemId, {
    ...(existing || {}),
    lastOpened: now,
  }, now);
  await writeJsonAtomic(paths.metadataPath, metadata);

  return {
    ...paths,
    metadata,
    relativeNotebookPath: relativeNotebookPath(problemId),
  };
}

async function setProblemStatus(workspaceRoot, problemId, status) {
  if (!PROBLEM_STATUSES.has(status)) throw new TypeError(`Invalid problem status: ${status}`);
  return updateProblemMetadata(workspaceRoot, problemId, { status });
}

async function recordProblemRun(workspaceRoot, problemId, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) throw new TypeError('durationMs must be non-negative');
  const existing = await readProblemMetadata(workspaceRoot, problemId);
  return updateProblemMetadata(workspaceRoot, problemId, {
    runCount: existing.runCount + 1,
    lastRun: {
      durationMs: Math.round(durationMs),
      finishedAt: new Date().toISOString(),
    },
  });
}

async function readSolutionsIndex(workspaceRoot, problemId) {
  const { solutionsIndexPath } = problemPaths(workspaceRoot, problemId);
  const raw = await readJson(solutionsIndexPath, { schemaVersion: 1, solutions: [] });
  const solutions = Array.isArray(raw?.solutions) ? raw.solutions : [];
  return { schemaVersion: 1, solutions };
}

function nextStableId(items, prefix) {
  let max = 0;
  for (const item of items) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(String(item?.id || ''));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

async function saveSolutionSnapshot(workspaceRoot, problemId, details = {}) {
  const paths = problemPaths(workspaceRoot, problemId);
  if (!(await pathExists(paths.notebookPath))) throw new Error(`Problem ${problemId} has no working notebook`);

  const index = await readSolutionsIndex(workspaceRoot, problemId);
  const id = nextStableId(index.solutions, 's');
  const relativeFile = path.posix.join('solutions', `${id}.ipynb`);
  const destination = path.join(paths.dir, 'solutions', `${id}.ipynb`);
  await fs.mkdir(paths.solutionsDir, { recursive: true });
  await fs.copyFile(paths.notebookPath, destination);

  const entry = {
    id,
    name: String(details.name || '').trim() || `Solution ${id.slice(1)}`,
    description: String(details.description || '').trim(),
    tags: Array.isArray(details.tags)
      ? details.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : String(details.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
    created: new Date().toISOString(),
    notebook: relativeFile,
  };
  index.solutions.push(entry);
  await writeJsonAtomic(paths.solutionsIndexPath, index);
  await updateProblemMetadata(workspaceRoot, problemId, { solutionCount: index.solutions.length });
  return entry;
}

async function listSolutions(workspaceRoot, problemId) {
  const index = await readSolutionsIndex(workspaceRoot, problemId);
  return index.solutions.map((item) => ({ ...item }));
}

async function listProblems(workspaceRoot) {
  const problemsRoot = path.join(workspaceRoot, 'problems');
  let entries;
  try {
    entries = await fs.readdir(problemsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const problemId = Number(entry.name);
    if (!Number.isSafeInteger(problemId) || problemId <= 0) continue;
    const metadata = await readProblemMetadata(workspaceRoot, problemId);
    const solutions = await listSolutions(workspaceRoot, problemId);
    result.push({ ...metadata, solutionCount: solutions.length });
  }
  result.sort((a, b) => a.id - b.id);
  return result;
}

module.exports = {
  PROBLEM_STATUSES,
  absoluteNotebookPath,
  ensureProblemWorkspace,
  listProblems,
  listSolutions,
  makeNotebook,
  nextStableId,
  normalizeProblemMetadata,
  pathExists,
  problemDirectoryName,
  problemPaths,
  readJson,
  readProblemMetadata,
  recordProblemRun,
  relativeNotebookPath,
  saveSolutionSnapshot,
  setProblemStatus,
  updateProblemMetadata,
  writeJsonAtomic,
};
