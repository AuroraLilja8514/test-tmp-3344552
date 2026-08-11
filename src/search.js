'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function textFromNotebook(raw) {
  try {
    const notebook = JSON.parse(raw);
    if (!Array.isArray(notebook.cells)) return '';
    return notebook.cells.map((cell) => {
      const source = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source || '');
      return source;
    }).join('\n');
  } catch {
    return '';
  }
}

async function walk(root, relative = '') {
  const dir = path.join(root, relative);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.ipynb_checkpoints') continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, next));
    else files.push(next);
  }
  return files;
}

function classifyResult(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  const problemMatch = /^problems\/(\d+)\//.exec(normalized);
  const problemId = problemMatch ? Number(problemMatch[1]) : null;
  let kind = 'file';
  if (normalized.endsWith('/solution.ipynb')) kind = 'working-notebook';
  else if (/\/solutions\/s\d+\.ipynb$/.test(normalized)) kind = 'saved-solution';
  else if (normalized.includes('/articles/') && normalized.endsWith('.md')) kind = 'article';
  else if (normalized.includes('.workbench/snippets/') && normalized.endsWith('.py')) kind = 'snippet';
  return { kind, problemId, path: normalized };
}

async function searchWorkspace(workspaceRoot, query, { limit = 100 } = {}) {
  const needle = String(query || '').trim();
  if (!needle) return [];
  const folded = needle.toLocaleLowerCase();
  const files = await walk(workspaceRoot);
  const supported = files.filter((file) => /\.(?:ipynb|md|py)$/i.test(file));
  const results = [];

  for (const relativePath of supported) {
    if (results.length >= limit) break;
    const absolute = path.join(workspaceRoot, relativePath);
    let stat;
    try { stat = await fs.stat(absolute); } catch { continue; }
    if (stat.size > 5 * 1024 * 1024) continue;
    let raw;
    try { raw = await fs.readFile(absolute, 'utf8'); } catch { continue; }
    const text = relativePath.endsWith('.ipynb') ? textFromNotebook(raw) : raw;
    const index = text.toLocaleLowerCase().indexOf(folded);
    if (index < 0) continue;
    const start = Math.max(0, index - 100);
    const end = Math.min(text.length, index + needle.length + 160);
    const excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim();
    results.push({ ...classifyResult(relativePath), excerpt });
  }
  return results;
}

module.exports = { classifyResult, searchWorkspace, textFromNotebook, walk };
