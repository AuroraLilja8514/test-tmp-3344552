'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

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
        cell_type: 'markdown',
        metadata: {},
        source: [`# Project Euler ${problemId}\n`, '\n', 'Write notes and code below.\n'],
      },
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
      language_info: {
        name: 'python',
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

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
}

async function ensureProblemWorkspace(workspaceRoot, problemId) {
  const dir = path.join(workspaceRoot, 'problems', problemDirectoryName(problemId));
  const notebookPath = path.join(dir, 'solution.ipynb');
  const metadataPath = path.join(dir, 'problem.json');

  await fs.mkdir(dir, { recursive: true });

  if (!(await pathExists(notebookPath))) {
    await writeJsonAtomic(notebookPath, makeNotebook(problemId));
  }

  const now = new Date().toISOString();
  let created = now;
  if (await pathExists(metadataPath)) {
    try {
      const existing = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      if (typeof existing.created === 'string') created = existing.created;
    } catch {
      // Replace malformed app metadata; never touch the notebook itself.
    }
  }

  await writeJsonAtomic(metadataPath, {
    id: problemId,
    url: `https://projecteuler.net/problem=${problemId}`,
    created,
    lastOpened: now,
  });

  return {
    dir,
    notebookPath,
    metadataPath,
    relativeNotebookPath: relativeNotebookPath(problemId),
  };
}

module.exports = {
  absoluteNotebookPath,
  ensureProblemWorkspace,
  makeNotebook,
  problemDirectoryName,
  relativeNotebookPath,
  writeJsonAtomic,
};
