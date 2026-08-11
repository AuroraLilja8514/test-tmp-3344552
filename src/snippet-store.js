'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { nextStableId, readJson, writeJsonAtomic } = require('./workspace');

class SnippetStore {
  constructor(workspaceRoot) {
    this.root = path.join(workspaceRoot, '.workbench', 'snippets');
    this.indexPath = path.join(this.root, 'snippets.json');
  }

  async _readIndex() {
    const raw = await readJson(this.indexPath, { schemaVersion: 1, snippets: [] });
    return {
      schemaVersion: 1,
      snippets: Array.isArray(raw?.snippets) ? raw.snippets : [],
    };
  }

  async list() {
    const index = await this._readIndex();
    return index.snippets.map((item) => ({ ...item, tags: [...(item.tags || [])] }));
  }

  async add({ name, description = '', tags = [], source, sourceProblem = null, sourceSolution = null }) {
    const code = String(source ?? '');
    if (!code.trim()) throw new Error('Cannot save an empty cell as a snippet');
    const index = await this._readIndex();
    const id = nextStableId(index.snippets, 'snip');
    const file = `${id}.py`;
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(path.join(this.root, file), code.endsWith('\n') ? code : `${code}\n`, 'utf8');
    const entry = {
      id,
      name: String(name || '').trim() || `Snippet ${id.slice(4)}`,
      description: String(description || '').trim(),
      tags: Array.isArray(tags)
        ? tags.map((tag) => String(tag).trim()).filter(Boolean)
        : String(tags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
      file,
      language: 'python',
      sourceProblem: Number.isSafeInteger(sourceProblem) ? sourceProblem : null,
      sourceSolution: sourceSolution ? String(sourceSolution) : null,
      created: new Date().toISOString(),
    };
    index.snippets.push(entry);
    await writeJsonAtomic(this.indexPath, index);
    return { ...entry };
  }

  async read(id) {
    const index = await this._readIndex();
    const entry = index.snippets.find((item) => item.id === id);
    if (!entry) throw new Error(`Unknown snippet: ${id}`);
    const source = await fs.readFile(path.join(this.root, entry.file), 'utf8');
    return { ...entry, source };
  }

  async remove(id) {
    const index = await this._readIndex();
    const position = index.snippets.findIndex((item) => item.id === id);
    if (position < 0) return false;
    const [entry] = index.snippets.splice(position, 1);
    await fs.rm(path.join(this.root, entry.file), { force: true });
    await writeJsonAtomic(this.indexPath, index);
    return true;
  }
}

module.exports = { SnippetStore };
