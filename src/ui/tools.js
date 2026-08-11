'use strict';

const api = window.workbenchTools;
const $ = (id) => document.getElementById(id);
let context = null;
let activeSection = 'dashboard';
let currentArticle = null;

function setStatus(message, error = false) {
  const node = $('tools-status');
  node.textContent = message;
  node.style.color = error ? '#fca5a5' : '#a5b4fc';
}

async function task(message, fn) {
  setStatus(message);
  try {
    const result = await fn();
    setStatus('Ready');
    return result;
  } catch (error) {
    setStatus(error?.message || String(error), true);
    throw error;
  }
}

function node(tag, text = '', className = '') {
  const item = document.createElement(tag);
  if (text !== '') item.textContent = text;
  if (className) item.className = className;
  return item;
}

function clear(target) {
  while (target.firstChild) target.firstChild.remove();
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

function statusLabel(status) {
  return status === 'solved' ? 'Solved' : status === 'not_started' ? 'Not Started' : 'In Progress';
}

async function refreshContext() {
  context = await api.context();
  $('context-title').textContent = context?.problemId ? `Problem #${context.problemId}` : 'No problem notebook';
  $('context-subtitle').textContent = context?.problem
    ? `${statusLabel(context.problem.status)} · ${context.solutions.length} saved solution(s)`
    : 'Open a Project Euler problem in the main window.';
  return context;
}

async function renderDashboard() {
  const problems = await task('Loading dashboard…', () => api.dashboard());
  const body = $('dashboard-body');
  clear(body);
  for (const problem of problems || []) {
    const row = node('tr');
    row.append(node('td', `#${problem.id}`));
    const statusCell = node('td');
    const select = node('select');
    for (const [value, label] of [['not_started', 'Not Started'], ['in_progress', 'In Progress'], ['solved', 'Solved']]) {
      const option = node('option', label);
      option.value = value;
      if (problem.status === value) option.selected = true;
      select.append(option);
    }
    select.className = `status-${problem.status}`;
    select.addEventListener('change', async () => {
      await task('Updating status…', () => api.setStatus(problem.id, select.value));
      await refreshContext();
      await renderDashboard();
    });
    statusCell.append(select);
    row.append(statusCell);
    row.append(node('td', String(problem.solutionCount || 0)));
    row.append(node('td', formatDate(problem.lastOpened)));
    row.append(node('td', formatDuration(problem.lastRun?.durationMs)));
    body.append(row);
  }
  if (!problems?.length) {
    const row = node('tr');
    const cell = node('td', 'No local problem notebooks yet.');
    cell.colSpan = 5;
    row.append(cell);
    body.append(row);
  }
}

async function renderSolutions() {
  await refreshContext();
  const target = $('solutions-list');
  clear(target);
  $('save-solution').disabled = !context?.problemId;
  for (const solution of context?.solutions || []) {
    const card = node('article', '', 'card');
    const header = node('header');
    header.append(node('h4', `${solution.id} · ${solution.name}`));
    header.append(node('span', formatDate(solution.created), 'muted'));
    card.append(header);
    if (solution.description) card.append(node('p', solution.description));
    if (solution.tags?.length) card.append(node('div', solution.tags.join(' · '), 'tags'));
    target.append(card);
  }
  if (context?.problemId && !context.solutions.length) target.append(node('p', 'No saved solution snapshots yet.', 'muted'));
}

async function saveSolution() {
  const details = {
    name: $('solution-name').value,
    tags: $('solution-tags').value,
    description: $('solution-description').value,
  };
  await task('Saving solution snapshot…', () => api.saveSolution(details));
  $('solution-name').value = '';
  $('solution-tags').value = '';
  $('solution-description').value = '';
  await renderSolutions();
}

async function renderSnippets() {
  await refreshContext();
  const snippets = await task('Loading snippets…', () => api.snippets());
  const target = $('snippets-list');
  clear(target);
  $('save-snippet').disabled = !context?.problemId;
  for (const snippet of snippets || []) {
    const card = node('article', '', 'card');
    const header = node('header');
    header.append(node('h4', snippet.name));
    const provenance = snippet.sourceProblem ? `Problem #${snippet.sourceProblem}` : 'User snippet';
    header.append(node('span', provenance, 'muted'));
    card.append(header);
    if (snippet.description) card.append(node('p', snippet.description));
    if (snippet.tags?.length) card.append(node('div', snippet.tags.join(' · '), 'tags'));
    const actions = node('div', '', 'actions');
    const insert = node('button', 'Insert as new cell');
    insert.addEventListener('click', () => task('Inserting snippet…', () => api.insertSnippet(snippet.id)).catch(() => {}));
    const remove = node('button', 'Delete');
    remove.addEventListener('click', async () => {
      await task('Deleting snippet…', () => api.removeSnippet(snippet.id));
      await renderSnippets();
    });
    actions.append(insert, remove);
    card.append(actions);
    target.append(card);
  }
  if (!snippets?.length) target.append(node('p', 'No snippets. Save one from your own active Jupyter cell.', 'muted'));
}

async function saveSnippet() {
  await task('Saving active cell…', () => api.saveSnippet({
    name: $('snippet-name').value,
    tags: $('snippet-tags').value,
    description: $('snippet-description').value,
  }));
  $('snippet-name').value = '';
  $('snippet-tags').value = '';
  $('snippet-description').value = '';
  await renderSnippets();
}

async function runSearch() {
  const query = $('search-query').value.trim();
  const results = await task('Searching…', () => api.search(query));
  const target = $('search-results');
  clear(target);
  for (const result of results || []) {
    const card = node('article', '', 'card');
    const header = node('header');
    header.append(node('h4', result.problemId ? `Problem #${result.problemId} · ${result.kind}` : result.kind));
    header.append(node('span', result.path, 'muted'));
    card.append(header, node('p', result.excerpt));
    target.append(card);
  }
  if (query && !results?.length) target.append(node('p', 'No matches.', 'muted'));
}

async function renderStatistics() {
  const stats = await task('Computing statistics…', () => api.statistics());
  const target = $('statistics-grid');
  clear(target);
  const entries = [
    ['Started problems', stats.problemsStarted],
    ['Solved', stats.solved],
    ['In progress', stats.inProgress],
    ['Saved solutions', stats.solutionCount],
    ['Problems with 2+ solutions', stats.multiSolutionProblems],
    ['User snippets', stats.snippetCount],
    ['Generated articles', stats.articleCount],
    ['Run All executions', stats.runCount],
    ['Median last-run time', formatDuration(stats.medianLastRunMs)],
  ];
  for (const [label, value] of entries) {
    const card = node('div', '', 'stat');
    card.append(node('span', label), node('strong', String(value ?? '—')));
    target.append(card);
  }
}

async function renderPackages(output = '') {
  const packages = await task('Loading managed packages…', () => api.packages());
  const body = $('packages-body');
  clear(body);
  $('package-output').textContent = output;
  for (const pkg of packages || []) {
    const row = node('tr');
    row.append(node('td', pkg.name), node('td', pkg.version));
    const action = node('td');
    const button = node('button', 'Uninstall');
    button.addEventListener('click', async () => {
      const result = await task(`Uninstalling ${pkg.name}…`, () => api.uninstallPackage(pkg.name));
      await renderPackages(result.output || 'Package removed. Restart the kernel if it was already imported.');
    });
    action.append(button);
    row.append(action);
    body.append(row);
  }
  if (!packages?.length) {
    const row = node('tr');
    const cell = node('td', 'No user-installed packages. The bundled base environment is intentionally not listed here.');
    cell.colSpan = 3;
    row.append(cell);
    body.append(row);
  }
}

async function installPackage() {
  const spec = $('package-spec').value.trim();
  const result = await task(`Installing ${spec}…`, () => api.installPackage(spec));
  $('package-spec').value = '';
  await renderPackages(result.output || 'Package installed. Restart the kernel if necessary.');
}

async function loadAI() {
  await refreshContext();
  const config = await task('Loading AI configuration…', () => api.aiConfig());
  $('ai-endpoint').value = config.endpoint || '';
  $('ai-model').value = config.model || '';
  $('ai-temperature').value = String(config.temperature ?? 0.2);
  $('ai-remember').checked = Boolean(config.rememberKey);
  $('ai-key').placeholder = config.storedKeyAvailable ? 'Stored securely; leave blank to reuse' : 'Session key or new key';
  await renderArticleSources();
  await renderArticles();
}

function aiForm() {
  return {
    endpoint: $('ai-endpoint').value.trim(),
    model: $('ai-model').value.trim(),
    temperature: Number($('ai-temperature').value),
    apiKey: $('ai-key').value,
    rememberKey: $('ai-remember').checked,
  };
}

async function renderArticleSources() {
  const target = $('article-solution-sources');
  clear(target);
  if (!context?.problemId) {
    target.append(node('p', 'Open a problem notebook to generate an article.', 'muted'));
    $('article-generate').disabled = true;
    return;
  }
  $('article-generate').disabled = false;
  for (const solution of context.solutions || []) {
    const label = node('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.solutionId = solution.id;
    label.append(checkbox, document.createTextNode(`${solution.id} · ${solution.name}`));
    target.append(label);
  }
}

async function renderArticles() {
  const target = $('articles-list');
  clear(target);
  currentArticle = null;
  $('article-editor').classList.add('hidden');
  if (!context?.problemId) return;
  const articles = await api.articles(context.problemId);
  for (const article of articles || []) {
    const card = node('article', '', 'card');
    const header = node('header');
    header.append(node('h4', `${article.id} · ${article.title}`));
    header.append(node('span', article.model || 'AI', 'muted'));
    card.append(header);
    const actions = node('div', '', 'actions');
    const edit = node('button', 'Open / Edit Markdown');
    edit.addEventListener('click', async () => {
      currentArticle = await task('Loading article…', () => api.readArticle(context.problemId, article.id));
      $('article-edit-title').value = currentArticle.title;
      $('article-edit-markdown').value = currentArticle.markdown;
      $('article-editor').classList.remove('hidden');
    });
    actions.append(edit);
    card.append(actions);
    target.append(card);
  }
  if (!articles?.length) target.append(node('p', 'No generated articles yet.', 'muted'));
}

async function generateArticle() {
  const selected = Array.from(document.querySelectorAll('[data-solution-id]:checked')).map((item) => item.dataset.solutionId);
  const result = await task('Generating article…', () => api.generateArticle({
    problemId: context?.problemId,
    includeWorking: $('article-current').checked,
    solutionIds: selected,
    title: $('article-title').value,
    instruction: $('article-instruction').value,
    apiKey: $('ai-key').value,
  }));
  currentArticle = result;
  $('article-edit-title').value = result.title;
  $('article-edit-markdown').value = result.markdown;
  $('article-editor').classList.remove('hidden');
  await refreshContext();
  await renderArticles();
}

async function saveArticleEdits() {
  if (!currentArticle || !context?.problemId) return;
  currentArticle = await task('Saving article…', () => api.updateArticle(context.problemId, currentArticle.id, {
    title: $('article-edit-title').value,
    markdown: $('article-edit-markdown').value,
  }));
  await renderArticles();
}

async function selectSection(section) {
  activeSection = section || 'dashboard';
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === `section-${activeSection}`));
  document.querySelectorAll('[data-section]').forEach((button) => button.classList.toggle('active', button.dataset.section === activeSection));
  try {
    if (activeSection === 'dashboard') await renderDashboard();
    else if (activeSection === 'solutions') await renderSolutions();
    else if (activeSection === 'snippets') await renderSnippets();
    else if (activeSection === 'statistics') await renderStatistics();
    else if (activeSection === 'packages') await renderPackages();
    else if (activeSection === 'ai') await loadAI();
    else await refreshContext();
  } catch { /* task() already surfaced the error */ }
}

document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => selectSection(button.dataset.section)));
$('save-solution').addEventListener('click', () => saveSolution().catch(() => {}));
$('save-snippet').addEventListener('click', () => saveSnippet().catch(() => {}));
$('search-button').addEventListener('click', () => runSearch().catch(() => {}));
$('search-query').addEventListener('keydown', (event) => { if (event.key === 'Enter') runSearch().catch(() => {}); });
$('package-install').addEventListener('click', () => installPackage().catch(() => {}));
$('kernel-restart').addEventListener('click', () => task('Restarting kernel…', () => api.restartKernel()).catch(() => {}));
$('ai-save').addEventListener('click', () => task('Saving AI configuration…', () => api.saveAI(aiForm())).then(loadAI).catch(() => {}));
$('ai-test').addEventListener('click', () => task('Testing AI endpoint…', () => api.testAI(aiForm())).then((result) => setStatus(`AI: ${result.response}`)).catch(() => {}));
$('article-generate').addEventListener('click', () => generateArticle().catch(() => {}));
$('article-save').addEventListener('click', () => saveArticleEdits().catch(() => {}));

api.onSection((section) => selectSection(section));
refreshContext().then(() => selectSection(activeSection)).catch((error) => setStatus(error.message, true));
