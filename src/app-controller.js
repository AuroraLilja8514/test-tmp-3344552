'use strict';

const { shell } = require('electron');
const { classifyEulerPage, isProjectEulerUrl, parseEulerProblemId } = require('./problem');
const { ensureProblemWorkspace } = require('./workspace');

class AppController {
  constructor({ leftView, rightView, window, workspaceRoot, stateStore, jupyter }) {
    this.leftView = leftView;
    this.rightView = rightView;
    this.window = window;
    this.workspaceRoot = workspaceRoot;
    this.stateStore = stateStore;
    this.jupyter = jupyter;

    const state = stateStore.get();
    this.leftUrl = state.lastLeftUrl;
    this.activePageProblemId = parseEulerProblemId(this.leftUrl);
    this.rightNotebookProblemId = state.lastNotebookProblemId;
    this.saveState = 'saved';
    this.message = 'Starting…';
    this._controlledNavigation = false;
    this._operationChain = Promise.resolve();
  }

  bindEvents() {
    const wc = this.leftView.webContents;

    wc.on('will-navigate', (event, detailsOrUrl) => {
      const targetUrl = typeof detailsOrUrl === 'string' ? detailsOrUrl : detailsOrUrl.url;
      if (!targetUrl) return;

      if (!isProjectEulerUrl(targetUrl)) {
        event.preventDefault();
        shell.openExternal(targetUrl).catch(() => {});
        return;
      }

      if (this._controlledNavigation) return;

      const fromProblem = parseEulerProblemId(wc.getURL());
      const toProblem = parseEulerProblemId(targetUrl);
      if (fromProblem !== null && fromProblem !== toProblem) {
        event.preventDefault();
        this.enqueue(async () => {
          await this.saveRightNotebook('Leaving problem page');
          await this.loadLeftControlled(targetUrl);
        });
      }
    });

    wc.on('will-redirect', (event, detailsOrUrl) => {
      const targetUrl = typeof detailsOrUrl === 'string' ? detailsOrUrl : detailsOrUrl.url;
      if (!targetUrl || !isProjectEulerUrl(targetUrl)) return;
      const fromProblem = parseEulerProblemId(wc.getURL());
      const toProblem = parseEulerProblemId(targetUrl);
      if (fromProblem !== null && fromProblem !== toProblem && !this._controlledNavigation) {
        event.preventDefault();
        this.enqueue(async () => {
          await this.saveRightNotebook('Leaving problem page');
          await this.loadLeftControlled(targetUrl);
        });
      }
    });

    const navigated = (_event, url) => this.enqueue(() => this.afterLeftNavigation(url));
    wc.on('did-navigate', navigated);
    wc.on('did-navigate-in-page', navigated);
    wc.on('page-title-updated', () => this.pushUiState());
    wc.on('did-start-loading', () => this.pushUiState());
    wc.on('did-stop-loading', () => this.pushUiState());

    wc.setWindowOpenHandler(({ url }) => {
      if (isProjectEulerUrl(url)) {
        this.enqueue(async () => {
          const currentProblem = parseEulerProblemId(wc.getURL());
          const nextProblem = parseEulerProblemId(url);
          if (currentProblem !== null && currentProblem !== nextProblem) {
            await this.saveRightNotebook('Leaving problem page');
          }
          await this.loadLeftControlled(url);
        });
      } else {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });
  }

  enqueue(operation) {
    this._operationChain = this._operationChain
      .then(operation)
      .catch((error) => {
        this.saveState = 'error';
        this.message = error?.message || String(error);
        this.pushUiState();
        console.error(error);
      });
    return this._operationChain;
  }

  async restore() {
    if (this.rightNotebookProblemId) {
      const item = await ensureProblemWorkspace(this.workspaceRoot, this.rightNotebookProblemId);
      this.message = `Opening Problem ${this.rightNotebookProblemId} notebook…`;
      this.pushUiState();
      await this.jupyter.openNotebook(this.rightNotebookProblemId, item.relativeNotebookPath);
      this.message = 'Ready';
    } else {
      await this.jupyter.showPlaceholder('Open a Project Euler problem on the left to create its notebook.');
      this.message = 'Ready';
    }
    this.pushUiState();

    const initialUrl = isProjectEulerUrl(this.leftUrl) ? this.leftUrl : 'https://projecteuler.net/';
    await this.loadLeftControlled(initialUrl);
  }

  async loadLeftControlled(url) {
    if (!isProjectEulerUrl(url)) throw new Error('Only Project Euler pages can open in the left pane');
    this._controlledNavigation = true;
    try {
      await this.leftView.webContents.loadURL(url);
    } finally {
      this._controlledNavigation = false;
    }
  }

  async afterLeftNavigation(url) {
    if (!isProjectEulerUrl(url)) return;
    this.leftUrl = url;
    const page = classifyEulerPage(url);
    this.activePageProblemId = page.problemId;
    await this.stateStore.patch({ lastLeftUrl: url });

    if (page.kind === 'problem') {
      await this.openProblem(page.problemId);
    } else {
      // A list/login/account/forum page has no notebook identity. Keep the last
      // notebook visible on the right, but remove the left-page binding.
      this.message = this.rightNotebookProblemId
        ? `Browsing Project Euler · notebook remains Problem ${this.rightNotebookProblemId}`
        : 'Browsing Project Euler · no problem notebook yet';
    }
    this.pushUiState();
  }

  async openProblem(problemId) {
    if (this.rightNotebookProblemId !== null && this.rightNotebookProblemId !== problemId) {
      await this.saveRightNotebook(`Switching to Problem ${problemId}`);
    }

    const item = await ensureProblemWorkspace(this.workspaceRoot, problemId);
    if (this.rightNotebookProblemId !== problemId || this.jupyter.currentNotebookProblemId !== problemId) {
      this.message = `Opening Problem ${problemId} notebook…`;
      this.pushUiState();
      await this.jupyter.openNotebook(problemId, item.relativeNotebookPath);
    }

    this.rightNotebookProblemId = problemId;
    this.saveState = 'saved';
    this.message = `Problem ${problemId}`;
    await this.stateStore.patch({ lastNotebookProblemId: problemId });
    this.pushUiState();
  }

  async saveRightNotebook(reason = 'Saving') {
    if (!this.rightNotebookProblemId) return;
    this.saveState = 'saving';
    this.message = reason;
    this.pushUiState();
    await this.jupyter.saveAll();
    this.saveState = 'saved';
    this.message = `Problem ${this.rightNotebookProblemId} saved`;
    this.pushUiState();
  }

  async goBack() {
    return this.enqueue(async () => {
      const history = this.leftView.webContents.navigationHistory;
      if (!history.canGoBack()) return;
      if (parseEulerProblemId(this.leftView.webContents.getURL()) !== null) {
        await this.saveRightNotebook('Saving before Back');
      }
      history.goBack();
    });
  }

  async goForward() {
    return this.enqueue(async () => {
      const history = this.leftView.webContents.navigationHistory;
      if (!history.canGoForward()) return;
      if (parseEulerProblemId(this.leftView.webContents.getURL()) !== null) {
        await this.saveRightNotebook('Saving before Forward');
      }
      history.goForward();
    });
  }

  async reload() {
    return this.enqueue(async () => {
      if (parseEulerProblemId(this.leftView.webContents.getURL()) !== null) {
        await this.saveRightNotebook('Saving before Reload');
      }
      this.leftView.webContents.reload();
    });
  }

  async home() {
    return this.enqueue(async () => {
      const currentProblem = parseEulerProblemId(this.leftView.webContents.getURL());
      if (currentProblem !== null) await this.saveRightNotebook('Leaving problem page');
      await this.loadLeftControlled('https://projecteuler.net/');
    });
  }

  getUiState() {
    const history = this.leftView.webContents.navigationHistory;
    return {
      leftUrl: this.leftView.webContents.getURL() || this.leftUrl,
      leftTitle: this.leftView.webContents.getTitle() || 'Project Euler',
      activePageProblemId: this.activePageProblemId,
      rightNotebookProblemId: this.rightNotebookProblemId,
      saveState: this.saveState,
      message: this.message,
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
      isLoading: this.leftView.webContents.isLoading(),
      splitRatio: this.stateStore.get().splitRatio,
    };
  }

  pushUiState() {
    if (this.window?.isDestroyed()) return;
    this.window.webContents.send('ui:state', this.getUiState());
  }

  async beforeClose() {
    await this._operationChain;
    await this.saveRightNotebook('Saving before exit');
  }
}

module.exports = { AppController };
