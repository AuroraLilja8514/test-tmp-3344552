'use strict';

const api = window.eulerWorkbench;
const elements = {
  back: document.getElementById('back'),
  forward: document.getElementById('forward'),
  reload: document.getElementById('reload'),
  home: document.getElementById('home'),
  save: document.getElementById('save'),
  runAll: document.getElementById('run-all'),
  problemStatus: document.getElementById('problem-status'),
  pageLabel: document.getElementById('page-label'),
  pageSubtitle: document.getElementById('page-subtitle'),
  notebookLabel: document.getElementById('notebook-label'),
  solutionCount: document.getElementById('solution-count'),
  lastRun: document.getElementById('last-run'),
  saveIndicator: document.getElementById('save-indicator'),
  url: document.getElementById('url'),
  message: document.getElementById('message'),
  divider: document.getElementById('divider'),
};

let applyingState = false;

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

function applyState(state) {
  if (!state) return;
  applyingState = true;
  try {
    elements.back.disabled = !state.canGoBack;
    elements.forward.disabled = !state.canGoForward;
    elements.reload.disabled = false;

    if (state.activePageProblemId) {
      elements.pageLabel.textContent = `Problem ${state.activePageProblemId}`;
      elements.pageSubtitle.textContent = state.leftTitle || state.leftUrl;
    } else {
      elements.pageLabel.textContent = 'Project Euler';
      elements.pageSubtitle.textContent = 'Non-problem page · notebook binding unchanged';
    }

    elements.notebookLabel.textContent = state.rightNotebookProblemId
      ? `Notebook #${state.rightNotebookProblemId}`
      : 'No notebook';
    elements.problemStatus.disabled = !state.rightNotebookProblemId;
    if (state.problemStatus) elements.problemStatus.value = state.problemStatus;
    elements.solutionCount.textContent = `Solutions: ${state.solutionCount || 0}`;
    elements.lastRun.textContent = `Last run: ${formatDuration(state.lastRun?.durationMs)}`;

    const saveState = state.saveState || 'saved';
    elements.saveIndicator.className = `save ${saveState}`;
    elements.saveIndicator.textContent = saveState === 'saving'
      ? 'Working…'
      : saveState === 'error' ? 'Error' : 'Saved';

    elements.url.textContent = state.leftUrl || '';
    elements.message.textContent = state.message || '';

    const ratio = Number(state.splitRatio) || 0.45;
    document.documentElement.style.setProperty('--split', `${ratio * 100}%`);
  } finally {
    applyingState = false;
  }
}

async function runAction(action) {
  try {
    elements.message.textContent = 'Working…';
    return await action();
  } catch (error) {
    elements.message.textContent = error?.message || String(error);
    throw error;
  }
}

elements.back.addEventListener('click', () => runAction(() => api.back()).catch(() => {}));
elements.forward.addEventListener('click', () => runAction(() => api.forward()).catch(() => {}));
elements.reload.addEventListener('click', () => runAction(() => api.reload()).catch(() => {}));
elements.home.addEventListener('click', () => runAction(() => api.home()).catch(() => {}));
elements.save.addEventListener('click', () => runAction(() => api.save()).catch(() => {}));
elements.runAll.addEventListener('click', () => runAction(() => api.runAll()).catch(() => {}));
elements.problemStatus.addEventListener('change', () => {
  if (applyingState) return;
  runAction(() => api.setProblemStatus(elements.problemStatus.value)).catch(() => {});
});

document.querySelectorAll('[data-tool]').forEach((button) => {
  button.addEventListener('click', () => api.openTools(button.dataset.tool));
});

let dragging = false;
elements.divider.addEventListener('pointerdown', (event) => {
  dragging = true;
  elements.divider.classList.add('dragging');
  elements.divider.setPointerCapture(event.pointerId);
});

elements.divider.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const ratio = Math.min(0.8, Math.max(0.2, event.clientX / window.innerWidth));
  document.documentElement.style.setProperty('--split', `${ratio * 100}%`);
  api.setSplitRatio(ratio);
});

function stopDragging(event) {
  if (!dragging) return;
  dragging = false;
  elements.divider.classList.remove('dragging');
  try { elements.divider.releasePointerCapture(event.pointerId); } catch { /* already released */ }
}

elements.divider.addEventListener('pointerup', stopDragging);
elements.divider.addEventListener('pointercancel', stopDragging);

api.onState(applyState);
api.getState().then(applyState);
