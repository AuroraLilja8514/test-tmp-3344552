'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error('Could not determine a free localhost port'));
        else resolve(port);
      });
    });
  });
}

function resolveBundledPython(runtimeRoot) {
  const candidates = process.platform === 'win32'
    ? [path.join(runtimeRoot, 'python.exe')]
    : [path.join(runtimeRoot, 'bin', 'python3'), path.join(runtimeRoot, 'bin', 'python')];
  return candidates[0];
}

function runtimeBinDirectories(runtimeRoot) {
  return process.platform === 'win32'
    ? [runtimeRoot, path.join(runtimeRoot, 'Scripts')]
    : [path.join(runtimeRoot, 'bin')];
}

function makeIsolatedEnvironment({ runtimeRoot, dataRoot }) {
  // Deliberately do not inherit host Python/virtualenv/Conda settings. The
  // Jupyter Server process itself sees only the bundled environment. Managed
  // user packages are added separately to the kernel spec, never to this env.
  const passThroughKeys = [
    'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR',
    'LANG', 'LC_ALL', 'LC_CTYPE',
  ];
  const env = {};
  for (const key of passThroughKeys) {
    if (process.env[key]) env[key] = process.env[key];
  }

  const privateHome = path.join(dataRoot, 'home');
  env.HOME = privateHome;
  if (process.platform === 'win32') {
    env.USERPROFILE = privateHome;
    env.APPDATA = path.join(dataRoot, 'appdata', 'roaming');
    env.LOCALAPPDATA = path.join(dataRoot, 'appdata', 'local');
  }

  env.PATH = runtimeBinDirectories(runtimeRoot).join(path.delimiter);
  env.PYTHONNOUSERSITE = '1';
  env.PYTHONSAFEPATH = '1';
  env.PYTHONUTF8 = '1';
  env.PYTHONDONTWRITEBYTECODE = '0';
  env.JUPYTER_CONFIG_DIR = path.join(dataRoot, 'jupyter-config');
  env.JUPYTER_DATA_DIR = path.join(dataRoot, 'jupyter-data');
  env.JUPYTER_RUNTIME_DIR = path.join(dataRoot, 'jupyter-runtime');
  env.IPYTHONDIR = path.join(dataRoot, 'ipython');
  env.MPLCONFIGDIR = path.join(dataRoot, 'matplotlib');
  return env;
}

async function ensureRuntimeDirectories(env, userPackagesRoot = null) {
  const dirs = [
    env.HOME,
    env.APPDATA,
    env.LOCALAPPDATA,
    env.JUPYTER_CONFIG_DIR,
    env.JUPYTER_DATA_DIR,
    env.JUPYTER_RUNTIME_DIR,
    env.IPYTHONDIR,
    env.MPLCONFIGDIR,
    userPackagesRoot,
  ].filter(Boolean);
  await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })));
}

async function ensureBundledKernelSpec(env, pythonExecutable, userPackagesRoot = null) {
  const kernelDir = path.join(env.JUPYTER_DATA_DIR, 'kernels', 'python3');
  await fs.mkdir(kernelDir, { recursive: true });
  const kernelEnv = {
    PYTHONNOUSERSITE: '1',
    PYTHONSAFEPATH: '1',
    PYTHONUTF8: '1',
    PATH: env.PATH,
  };
  if (userPackagesRoot) kernelEnv.PYTHONPATH = userPackagesRoot;
  const spec = {
    argv: [pythonExecutable, '-m', 'ipykernel_launcher', '-f', '{connection_file}'],
    display_name: 'Euler Python',
    language: 'python',
    env: kernelEnv,
    metadata: { debugger: true },
  };
  await fs.writeFile(path.join(kernelDir, 'kernel.json'), `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
}

function pythonString(value) {
  return JSON.stringify(value);
}

async function writeJupyterConfig(env, { workspaceRoot, port, token }) {
  const config = [
    'c = get_config()',
    `c.ServerApp.ip = ${pythonString('127.0.0.1')}`,
    `c.ServerApp.port = ${port}`,
    'c.ServerApp.port_retries = 0',
    `c.ServerApp.root_dir = ${pythonString(workspaceRoot)}`,
    'c.ServerApp.open_browser = False',
    'c.ServerApp.allow_root = True',
    'c.ServerApp.allow_remote_access = False',
    'c.ServerApp.terminals_enabled = False',
    'c.ServerApp.use_redirect_file = False',
    `c.IdentityProvider.token = ${pythonString(token)}`,
    'c.LabApp.expose_app_in_browser = True',
    'c.LabApp.extension_manager = "readonly"',
    'c.LabApp.lock_all_plugins = True',
    'c.LabApp.news_url = None',
    'c.KernelSpecManager.ensure_native_kernel = False',
    'c.KernelSpecManager.allowed_kernelspecs = {"python3"}',
    '',
  ].join('\n');
  await fs.writeFile(path.join(env.JUPYTER_CONFIG_DIR, 'jupyter_lab_config.py'), config, 'utf8');
}

async function writeSubmitStartup(env, { port, token }) {
  const startupDir = path.join(env.IPYTHONDIR, 'profile_default', 'startup');
  await fs.mkdir(startupDir, { recursive: true });
  const code = [
    '# Generated by Project Euler Workbench. Do not edit.',
    'import json as _ewb_json',
    'import urllib.request as _ewb_urlrequest',
    `__ewb_submit_url = ${pythonString(`http://127.0.0.1:${port}/submit`)}`,
    `__ewb_submit_token = ${pythonString(token)}`,
    '',
    'def submit(value):',
    '    """Fill the Project Euler answer box; the user still submits manually."""',
    '    text = str(value)',
    '    if len(text) > 1000:',
    '        raise ValueError("submit() value is too long")',
    '    body = _ewb_json.dumps({"value": text}).encode("utf-8")',
    '    request = _ewb_urlrequest.Request(',
    '        __ewb_submit_url,',
    '        data=body,',
    '        method="POST",',
    '        headers={',
    '            "Authorization": "Bearer " + __ewb_submit_token,',
    '            "Content-Type": "application/json",',
    '        },',
    '    )',
    '    try:',
    '        with _ewb_urlrequest.urlopen(request, timeout=5) as response:',
    '            payload = _ewb_json.loads(response.read().decode("utf-8"))',
    '    except Exception as exc:',
    '        raise RuntimeError("Workbench could not fill the answer box: " + str(exc)) from exc',
    '    message = payload.get("message", "Answer filled in Project Euler; review and submit it manually.")',
    '    print(message)',
    '',
  ].join('\n');
  await fs.writeFile(path.join(startupDir, '00-euler-workbench.py'), code, 'utf8');
}

function encodedNotebookPath(relativePath) {
  return relativePath.split('/').map(encodeURIComponent).join('/');
}

class JupyterManager {
  constructor({ runtimeRoot, dataRoot, workspaceRoot, userPackagesRoot = null, log = console }) {
    this.runtimeRoot = runtimeRoot;
    this.dataRoot = dataRoot;
    this.workspaceRoot = workspaceRoot;
    this.userPackagesRoot = userPackagesRoot;
    this.log = log;
    this.pythonExecutable = resolveBundledPython(runtimeRoot);
    this.env = makeIsolatedEnvironment({ runtimeRoot, dataRoot });
    this.port = null;
    this.token = null;
    this.process = null;
    this.view = null;
    this.currentNotebookProblemId = null;
    this.currentRelativeNotebookPath = null;
    this.labLoaded = false;
    this.submitServer = null;
    this.submitPort = null;
    this.submitToken = null;
    this.submitHandler = null;
  }

  setSubmitHandler(handler) {
    this.submitHandler = typeof handler === 'function' ? handler : null;
  }

  attachView(view) {
    this.view = view;
    view.webContents.on('did-finish-load', () => {
      const url = view.webContents.getURL();
      this.labLoaded = url.startsWith('http://127.0.0.1:');
    });
    view.webContents.on('render-process-gone', () => {
      this.labLoaded = false;
    });
  }

  async assertBundledPythonExists() {
    try {
      await fs.access(this.pythonExecutable);
    } catch {
      throw new Error(
        `Bundled Python runtime is missing at ${this.pythonExecutable}. ` +
        'Run "npm run prepare:runtime" before starting or packaging the app.'
      );
    }
  }

  async _startSubmitBridge() {
    this.submitToken = crypto.randomBytes(32).toString('hex');
    this.submitServer = http.createServer(async (request, response) => {
      const fail = (status, message) => {
        response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ ok: false, message }));
      };
      if (request.method !== 'POST' || request.url !== '/submit') return fail(404, 'Not found');
      if (request.headers.authorization !== `Bearer ${this.submitToken}`) return fail(403, 'Forbidden');

      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
        if (body.length > 8192) request.destroy();
      });
      request.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const value = String(parsed.value ?? '');
          if (!value || value.length > 1000 || /[\r\n]/.test(value)) throw new Error('Invalid answer value');
          if (!this.submitHandler) throw new Error('Workbench answer bridge is not ready');
          const result = await this.submitHandler(value);
          response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({
            ok: true,
            message: result?.message || 'Answer filled in Project Euler; review and submit it manually.',
          }));
        } catch (error) {
          fail(400, error.message || String(error));
        }
      });
    });

    await new Promise((resolve, reject) => {
      this.submitServer.once('error', reject);
      this.submitServer.listen(0, '127.0.0.1', () => {
        const address = this.submitServer.address();
        this.submitPort = typeof address === 'object' && address ? address.port : null;
        if (!this.submitPort) reject(new Error('Could not start answer bridge'));
        else resolve();
      });
    });
  }

  async start() {
    await this.assertBundledPythonExists();
    await ensureRuntimeDirectories(this.env, this.userPackagesRoot);
    await ensureBundledKernelSpec(this.env, this.pythonExecutable, this.userPackagesRoot);
    await this._startSubmitBridge();
    await writeSubmitStartup(this.env, { port: this.submitPort, token: this.submitToken });

    this.port = await findFreePort();
    this.token = crypto.randomBytes(32).toString('hex');
    await writeJupyterConfig(this.env, {
      workspaceRoot: this.workspaceRoot,
      port: this.port,
      token: this.token,
    });

    this.process = spawn(this.pythonExecutable, ['-m', 'jupyterlab'], {
      cwd: this.workspaceRoot,
      env: this.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.process.stdout.on('data', (chunk) => this._logJupyter(chunk));
    this.process.stderr.on('data', (chunk) => this._logJupyter(chunk));
    this.process.once('exit', (code, signal) => {
      this.log.info?.(`[jupyter] exited code=${code} signal=${signal}`);
      this.process = null;
    });

    await this._waitForServer();
  }

  _logJupyter(chunk) {
    let text = String(chunk);
    if (this.token) text = text.replaceAll(this.token, '<redacted-token>');
    if (this.submitToken) text = text.replaceAll(this.submitToken, '<redacted-submit-token>');
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) this.log.info?.(`[jupyter] ${line}`);
    }
  }

  _headers() {
    return { Authorization: `token ${this.token}` };
  }

  async _fetch(pathname, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      return await fetch(`http://127.0.0.1:${this.port}${pathname}`, {
        ...options,
        headers: { ...this._headers(), ...(options.headers || {}) },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async _waitForServer() {
    let lastError = null;
    for (let i = 0; i < 200; i += 1) {
      if (!this.process) throw new Error('Jupyter process exited before becoming ready');
      try {
        const response = await this._fetch('/api/kernelspecs');
        if (response.ok) return;
        lastError = new Error(`Jupyter readiness HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await sleep(50);
    }
    throw new Error(`Jupyter did not become ready: ${lastError?.message || 'unknown error'}`);
  }

  notebookUrl(relativePath) {
    if (!this.port || !this.token) throw new Error('Jupyter is not running');
    return `http://127.0.0.1:${this.port}/lab/tree/${encodedNotebookPath(relativePath)}?token=${encodeURIComponent(this.token)}`;
  }

  placeholderHtml(message = 'Open a Project Euler problem to begin.') {
    const escaped = String(message)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#111827;color:#d1d5db;font:15px system-ui;display:grid;place-items:center;height:100vh}.box{text-align:center;max-width:520px;padding:32px}.title{font-size:22px;color:#f9fafb;margin-bottom:8px}</style></head><body><div class="box"><div class="title">Project Euler Workbench</div><div>${escaped}</div></div></body></html>`)}`;
  }

  async showPlaceholder(message) {
    if (!this.view) return;
    this.labLoaded = false;
    await this.view.webContents.loadURL(this.placeholderHtml(message));
  }

  async waitForLabApp() {
    if (!this.view || !this.labLoaded) return false;
    for (let i = 0; i < 200; i += 1) {
      try {
        const ready = await this.view.webContents.executeJavaScript(
          'Boolean(window.jupyterapp && window.jupyterapp.commands && window.jupyterapp.commands.execute)',
          true
        );
        if (ready) return true;
      } catch {
        // The page can be between navigations; retry until it settles.
      }
      await sleep(50);
    }
    return false;
  }

  async executeLabCommand(command, args = {}) {
    const ready = await this.waitForLabApp();
    if (!ready) throw new Error('JupyterLab command interface is not ready');
    return this.view.webContents.executeJavaScript(
      `(async () => window.jupyterapp.commands.execute(${JSON.stringify(command)}, ${JSON.stringify(args)}))()`,
      true
    );
  }

  async saveAll() {
    if (!this.view || !this.currentRelativeNotebookPath || !this.labLoaded) return;
    await this.executeLabCommand('docmanager:save-all');
  }

  async runAllAndSave() {
    if (!this.currentRelativeNotebookPath) throw new Error('No notebook is open');
    const started = Date.now();
    const result = await this.executeLabCommand('notebook:run-all-cells');
    await this.saveAll();
    return { durationMs: Date.now() - started, result };
  }

  async getActiveCellSource() {
    const ready = await this.waitForLabApp();
    if (!ready) throw new Error('JupyterLab notebook interface is not ready');
    return this.view.webContents.executeJavaScript(`(() => {
      const panel = window.jupyterapp?.shell?.currentWidget;
      const cell = panel?.content?.activeCell;
      const shared = cell?.model?.sharedModel;
      if (shared && typeof shared.getSource === 'function') return shared.getSource();
      const json = cell?.model?.toJSON?.();
      if (Array.isArray(json?.source)) return json.source.join('');
      return typeof json?.source === 'string' ? json.source : null;
    })()`, true);
  }

  async insertCodeCell(source) {
    const code = String(source ?? '');
    if (!code) throw new Error('Snippet is empty');
    await this.executeLabCommand('notebook:insert-cell-below');
    const inserted = await this.view.webContents.executeJavaScript(`(() => {
      const panel = window.jupyterapp?.shell?.currentWidget;
      const cell = panel?.content?.activeCell;
      const shared = cell?.model?.sharedModel;
      if (!shared || typeof shared.setSource !== 'function') return false;
      shared.setSource(${JSON.stringify(code)});
      return true;
    })()`, true);
    if (!inserted) throw new Error('Could not insert snippet into the active notebook');
    await this.saveAll();
  }

  async restartCurrentKernel() {
    if (!this.currentRelativeNotebookPath) throw new Error('No notebook is open');
    const response = await this._fetch('/api/sessions');
    if (!response.ok) throw new Error(`Could not list Jupyter sessions: HTTP ${response.status}`);
    const sessions = await response.json();
    const session = sessions.find((item) => item?.path === this.currentRelativeNotebookPath) || sessions[0];
    const kernelId = session?.kernel?.id;
    if (!kernelId) throw new Error('No active kernel found');
    const restarted = await this._fetch(`/api/kernels/${encodeURIComponent(kernelId)}/restart`, { method: 'POST' });
    if (!restarted.ok) throw new Error(`Kernel restart failed: HTTP ${restarted.status}`);
    return true;
  }

  async shutdownAllSessions() {
    if (!this.process) return;
    let response;
    try {
      response = await this._fetch('/api/sessions');
    } catch {
      return;
    }
    if (!response.ok) return;
    const sessions = await response.json();
    for (const session of sessions) {
      if (!session?.id) continue;
      try {
        await this._fetch(`/api/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' });
      } catch (error) {
        this.log.warn?.(`[jupyter] failed to delete session ${session.id}: ${error.message}`);
      }
    }
  }

  async openNotebook(problemId, relativePath) {
    if (!this.view) throw new Error('Jupyter view is not attached');

    if (this.currentRelativeNotebookPath && this.currentRelativeNotebookPath !== relativePath) {
      await this.saveAll();
      await this.shutdownAllSessions();
    }

    if (this.currentRelativeNotebookPath === relativePath && this.labLoaded) {
      this.currentNotebookProblemId = problemId;
      return;
    }

    this.currentNotebookProblemId = problemId;
    this.currentRelativeNotebookPath = relativePath;
    this.labLoaded = false;
    await this.view.webContents.loadURL(this.notebookUrl(relativePath));
    this.labLoaded = true;
    const ready = await this.waitForLabApp();
    if (!ready) throw new Error(`JupyterLab did not finish opening ${relativePath}`);
  }

  async shutdown() {
    try {
      await this.saveAll();
    } catch (error) {
      this.log.warn?.(`[jupyter] final save failed: ${error.message}`);
    }
    await this.shutdownAllSessions();

    const child = this.process;
    if (child) {
      child.kill();
      for (let i = 0; i < 50 && this.process; i += 1) await sleep(50);
      if (this.process) {
        try { child.kill('SIGKILL'); } catch { /* already exited */ }
      }
      this.process = null;
    }

    if (this.submitServer) {
      await new Promise((resolve) => this.submitServer.close(() => resolve()));
      this.submitServer = null;
    }
  }
}

module.exports = {
  JupyterManager,
  encodedNotebookPath,
  ensureBundledKernelSpec,
  findFreePort,
  makeIsolatedEnvironment,
  resolveBundledPython,
  runtimeBinDirectories,
  writeJupyterConfig,
  writeSubmitStartup,
};
