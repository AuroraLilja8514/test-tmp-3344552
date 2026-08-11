'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { listProblems, problemPaths } = require('./workspace');

async function countArticles(workspaceRoot, problemId) {
  const { articlesDir } = problemPaths(workspaceRoot, problemId);
  try {
    const entries = await fs.readdir(articlesDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && /^a\d+$/.test(entry.name)).length;
  } catch {
    return 0;
  }
}

async function computeStatistics(workspaceRoot, snippets = []) {
  const problems = await listProblems(workspaceRoot);
  let articleCount = 0;
  for (const problem of problems) articleCount += await countArticles(workspaceRoot, problem.id);
  const solved = problems.filter((item) => item.status === 'solved').length;
  const inProgress = problems.filter((item) => item.status === 'in_progress').length;
  const notStarted = problems.filter((item) => item.status === 'not_started').length;
  const solutionCount = problems.reduce((sum, item) => sum + (item.solutionCount || 0), 0);
  const multiSolutionProblems = problems.filter((item) => (item.solutionCount || 0) >= 2).length;
  const runCount = problems.reduce((sum, item) => sum + (item.runCount || 0), 0);
  const lastRunDurations = problems
    .map((item) => item.lastRun?.durationMs)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const medianLastRunMs = lastRunDurations.length
    ? lastRunDurations[Math.floor(lastRunDurations.length / 2)]
    : null;

  return {
    problemsStarted: problems.length,
    solved,
    inProgress,
    notStarted,
    solutionCount,
    multiSolutionProblems,
    snippetCount: Array.isArray(snippets) ? snippets.length : 0,
    articleCount,
    runCount,
    medianLastRunMs,
  };
}

module.exports = { computeStatistics, countArticles };
