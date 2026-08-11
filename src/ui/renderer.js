'use strict';

const api = window.eulerWorkbench;
const elements = {
  back: document.getElementById('back'),
  forward: document.getElementById('forward'),
  reload: document.getElementById('reload'),
  home: document.getElementById('home'),
  pageLabel: document.getElementById('page-label'),
  pageSubtitle: document.getElementById('page-subtitle'),
  notebookLabel: document.getElementById('notebook-label'),
  saveIndicator: document.getElementById('save-indicator'),
  url: document.getElementById('url'),
  message: document.getElementById('message'),
  divider: document.getElementById('divider'),
};

function applyState(state) {
  if (!state) return;
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
    ? `Notebook ${state.rightNotebookProblemId}`
    : 'No notebook';

  const saveState = state.saveState || 'saved';
  elements.saveIndicator.className = `save ${saveState}`;
  elements.saveIndicator.textContent = saveState === 'saving'
    ? 'Saving…'
    : saveState === 'error' ? 'Save error' : 'Saved';

  elements.url.textContent = state.leftUrl || '';
  elements.message.textContent = state.message || '';

  const ratio = Number(state.splitRatio) || 0.45;
  document.documentElement.style.setProperty('--split', `${ratio * 100}%`);
}

elements.back.addEventListener('click', () => api.back());
elements.forward.addEventListener('click', () => api.forward());
elements.reload.addEventListener('click', () => api.reload());
elements.home.addEventListener('click', () => api.home());

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
