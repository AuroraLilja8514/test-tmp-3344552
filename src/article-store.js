'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { nextStableId, problemPaths, readJson, writeJsonAtomic } = require('./workspace');

function notebookToPromptText(notebook, label = 'Notebook') {
  const cells = Array.isArray(notebook?.cells) ? notebook.cells : [];
  const sections = [`# ${label}`];
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i] || {};
    const source = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source || '');
    if (!source.trim()) continue;
    if (cell.cell_type === 'code') sections.push(`\n## Code cell ${i + 1}\n\n\`\`\`python\n${source}\n\`\`\``);
    else if (cell.cell_type === 'markdown') sections.push(`\n## Markdown cell ${i + 1}\n\n${source}`);
  }
  return sections.join('\n');
}

async function readNotebook(filePath) {
  const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
  return parsed;
}

class ArticleStore {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
  }

  async list(problemId) {
    const { articlesDir } = problemPaths(this.workspaceRoot, problemId);
    let entries;
    try { entries = await fs.readdir(articlesDir, { withFileTypes: true }); } catch { return []; }
    const result = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^a\d+$/.test(entry.name)) continue;
      const metadataPath = path.join(articlesDir, entry.name, 'article.json');
      const metadata = await readJson(metadataPath, null);
      if (metadata) result.push(metadata);
    }
    result.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return result;
  }

  async create(problemId, { title, markdown, sources = [], model = null, endpoint = null }) {
    const existing = await this.list(problemId);
    const id = nextStableId(existing, 'a');
    const { articlesDir } = problemPaths(this.workspaceRoot, problemId);
    const dir = path.join(articlesDir, id);
    await fs.mkdir(dir, { recursive: true });
    const metadata = {
      schemaVersion: 1,
      id,
      problemId,
      title: String(title || '').trim() || `Problem ${problemId} analysis ${id.slice(1)}`,
      sources: Array.isArray(sources) ? sources : [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      model: model ? String(model) : null,
      endpoint: endpoint ? String(endpoint) : null,
    };
    await fs.writeFile(path.join(dir, 'article.md'), String(markdown || ''), 'utf8');
    await writeJsonAtomic(path.join(dir, 'article.json'), metadata);
    return { ...metadata, markdown: String(markdown || '') };
  }

  async read(problemId, id) {
    const { articlesDir } = problemPaths(this.workspaceRoot, problemId);
    const dir = path.join(articlesDir, id);
    const metadata = await readJson(path.join(dir, 'article.json'), null);
    if (!metadata) throw new Error(`Unknown article: ${id}`);
    const markdown = await fs.readFile(path.join(dir, 'article.md'), 'utf8');
    return { ...metadata, markdown };
  }

  async update(problemId, id, { title, markdown }) {
    const current = await this.read(problemId, id);
    const { articlesDir } = problemPaths(this.workspaceRoot, problemId);
    const dir = path.join(articlesDir, id);
    const metadata = {
      ...current,
      title: String(title ?? current.title).trim() || current.title,
      updated: new Date().toISOString(),
    };
    delete metadata.markdown;
    await fs.writeFile(path.join(dir, 'article.md'), String(markdown ?? current.markdown), 'utf8');
    await writeJsonAtomic(path.join(dir, 'article.json'), metadata);
    return { ...metadata, markdown: String(markdown ?? current.markdown) };
  }
}

module.exports = { ArticleStore, notebookToPromptText, readNotebook };
