'use strict';

const path = require('node:path');
const { AIManager } = require('./ai-manager');
const { ArticleStore, notebookToPromptText, readNotebook } = require('./article-store');
const { ManagedPackageManager } = require('./package-manager');
const { searchWorkspace } = require('./search');
const { SnippetStore } = require('./snippet-store');
const { computeStatistics } = require('./statistics');
const {
  listProblems,
  listSolutions,
  problemPaths,
  readProblemMetadata,
  saveSolutionSnapshot,
  setProblemStatus,
} = require('./workspace');

class WorkbenchService {
  constructor({ workspaceRoot, settingsRoot, packagesRoot, jupyter, controller, safeStorage = null }) {
    this.workspaceRoot = workspaceRoot;
    this.settingsRoot = settingsRoot;
    this.packagesRoot = packagesRoot;
    this.jupyter = jupyter;
    this.controller = controller;
    this.snippets = new SnippetStore(workspaceRoot);
    this.articles = new ArticleStore(workspaceRoot);
    this.packages = new ManagedPackageManager({
      pythonExecutable: jupyter.pythonExecutable,
      packagesRoot,
      baseEnv: jupyter.env,
    });
    this.ai = new AIManager({ settingsRoot, safeStorage });
  }

  currentProblemId() {
    return this.controller?.rightNotebookProblemId || null;
  }

  async dashboard() {
    return listProblems(this.workspaceRoot);
  }

  async currentContext() {
    const problemId = this.currentProblemId();
    if (!problemId) return { problemId: null, problem: null, solutions: [], articles: [] };
    return {
      problemId,
      problem: await readProblemMetadata(this.workspaceRoot, problemId),
      solutions: await listSolutions(this.workspaceRoot, problemId),
      articles: await this.articles.list(problemId),
    };
  }

  async setStatus(problemId, status) {
    const id = Number(problemId || this.currentProblemId());
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('No problem is selected');
    const metadata = await setProblemStatus(this.workspaceRoot, id, status);
    if (this.controller?.rightNotebookProblemId === id) await this.controller.refreshProblemMetadata();
    return metadata;
  }

  async saveCurrentSolution(details) {
    const problemId = this.currentProblemId();
    if (!problemId) throw new Error('Open a problem notebook before saving a solution');
    await this.controller.saveRightNotebook('Saving solution snapshot');
    const entry = await saveSolutionSnapshot(this.workspaceRoot, problemId, details);
    await this.controller.refreshProblemMetadata();
    return entry;
  }

  async listSnippets() {
    return this.snippets.list();
  }

  async saveActiveCellSnippet(details) {
    const source = await this.jupyter.getActiveCellSource();
    if (!source || !String(source).trim()) throw new Error('The active Jupyter cell is empty');
    return this.snippets.add({
      ...details,
      source,
      sourceProblem: this.currentProblemId(),
    });
  }

  async insertSnippet(id) {
    const snippet = await this.snippets.read(String(id));
    await this.jupyter.insertCodeCell(snippet.source);
    return snippet;
  }

  async removeSnippet(id) {
    return this.snippets.remove(String(id));
  }

  async search(query) {
    return searchWorkspace(this.workspaceRoot, query);
  }

  async statistics() {
    return computeStatistics(this.workspaceRoot, await this.snippets.list());
  }

  async listPackages() {
    return this.packages.list();
  }

  async installPackage(specification) {
    return this.packages.install(specification);
  }

  async uninstallPackage(name) {
    return this.packages.uninstall(name);
  }

  async restartKernel() {
    return this.jupyter.restartCurrentKernel();
  }

  async getAIConfig() {
    return this.ai.loadConfig();
  }

  async saveAIConfig(config) {
    return this.ai.saveConfig(config);
  }

  async testAI(config) {
    return this.ai.testConnection(config);
  }

  async generateArticle({
    problemId = null,
    includeWorking = true,
    solutionIds = [],
    title = '',
    instruction = '',
    apiKey = '',
  }) {
    const id = Number(problemId || this.currentProblemId());
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('No problem is selected');
    const paths = problemPaths(this.workspaceRoot, id);
    const sources = [];
    const chunks = [];

    if (includeWorking) {
      if (this.currentProblemId() === id) await this.controller.saveRightNotebook('Saving before AI analysis');
      const notebook = await readNotebook(paths.notebookPath);
      sources.push({ type: 'working-notebook', path: 'solution.ipynb' });
      chunks.push(notebookToPromptText(notebook, 'Current working notebook'));
    }

    const solutions = await listSolutions(this.workspaceRoot, id);
    for (const solutionId of Array.isArray(solutionIds) ? solutionIds : []) {
      const entry = solutions.find((item) => item.id === solutionId);
      if (!entry) continue;
      const notebookPath = path.join(paths.dir, ...String(entry.notebook).split('/'));
      const notebook = await readNotebook(notebookPath);
      sources.push({ type: 'saved-solution', id: entry.id, name: entry.name, path: entry.notebook });
      chunks.push(notebookToPromptText(notebook, `Saved solution ${entry.id}: ${entry.name}`));
    }

    if (!chunks.length) throw new Error('Select at least one notebook source for AI analysis');
    const config = await this.ai.loadConfig();
    const generated = await this.ai.generateArticle({
      problemId: id,
      sourceText: chunks.join('\n\n---\n\n'),
      instruction,
      mode: chunks.length > 1 ? 'comparison' : 'analysis',
      apiKey,
    });
    return this.articles.create(id, {
      title,
      markdown: generated.text,
      sources,
      model: generated.model,
      endpoint: generated.endpoint || config.endpoint,
    });
  }

  async listArticles(problemId = null) {
    const id = Number(problemId || this.currentProblemId());
    if (!Number.isSafeInteger(id) || id <= 0) return [];
    return this.articles.list(id);
  }

  async readArticle(problemId, articleId) {
    return this.articles.read(Number(problemId), String(articleId));
  }

  async updateArticle(problemId, articleId, update) {
    return this.articles.update(Number(problemId), String(articleId), update);
  }
}

module.exports = { WorkbenchService };
