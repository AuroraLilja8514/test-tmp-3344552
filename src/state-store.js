'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { writeJsonAtomic } = require('./workspace');

const DEFAULT_STATE = Object.freeze({
  lastLeftUrl: 'https://projecteuler.net/',
  lastNotebookProblemId: null,
  splitRatio: 0.45,
});

function sanitizeState(raw) {
  const state = { ...DEFAULT_STATE };
  if (raw && typeof raw === 'object') {
    if (typeof raw.lastLeftUrl === 'string' && raw.lastLeftUrl.length > 0) {
      state.lastLeftUrl = raw.lastLeftUrl;
    }
    if (Number.isSafeInteger(raw.lastNotebookProblemId) && raw.lastNotebookProblemId > 0) {
      state.lastNotebookProblemId = raw.lastNotebookProblemId;
    }
    if (typeof raw.splitRatio === 'number' && Number.isFinite(raw.splitRatio)) {
      state.splitRatio = Math.min(0.8, Math.max(0.2, raw.splitRatio));
    }
  }
  return state;
}

class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = { ...DEFAULT_STATE };
    this._writeChain = Promise.resolve();
  }

  async load() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      this.state = sanitizeState(parsed);
    } catch {
      this.state = { ...DEFAULT_STATE };
    }
    return { ...this.state };
  }

  get() {
    return { ...this.state };
  }

  async patch(partial) {
    this.state = sanitizeState({ ...this.state, ...partial });
    const snapshot = { ...this.state };
    this._writeChain = this._writeChain.then(() => writeJsonAtomic(this.filePath, snapshot));
    await this._writeChain;
    return { ...this.state };
  }
}

module.exports = {
  DEFAULT_STATE,
  StateStore,
  sanitizeState,
};
