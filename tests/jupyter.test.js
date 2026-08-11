'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  encodedNotebookPath,
  ensureBundledKernelSpec,
  makeIsolatedEnvironment,
  writeJupyterConfig,
  writeSubmitStartup,
} = require('../src/jupyter');

test('encodes notebook URL paths without losing separators', () => {
  assert.equal(encodedNotebookPath('problems/0187/solution.ipynb'), 'problems/0187/solution.ipynb');
  assert.equal(encodedNotebookPath('problems/a b/solution.ipynb'), 'problems/a%20b/solution.ipynb');
});

test('isolated environment never inherits the host Python environment', () => {
  const old = { ...process.env };
  process.env.PYTHONPATH = '/host/python';
  process.env.VIRTUAL_ENV = '/host/venv';
  process.env.CONDA_PREFIX = '/host/conda';
  try {
    const env = makeIsolatedEnvironment({ runtimeRoot: '/bundle/python', dataRoot: '/private/app' });
    assert.equal(env.PYTHONPATH, undefined);
    assert.equal(env.VIRTUAL_ENV, undefined);
    assert.equal(env.CONDA_PREFIX, undefined);
    assert.equal(env.PYTHONNOUSERSITE, '1');
    assert.ok(!env.PATH.includes('/host/venv'));

    const managed = makeIsolatedEnvironment({
      runtimeRoot: '/bundle/python',
      dataRoot: '/private/app',
      userPackagesRoot: '/private/packages',
    });
    assert.equal(managed.PYTHONPATH, '/private/packages');
    assert.notEqual(managed.PYTHONPATH, '/host/python');
  } finally {
    process.env = old;
  }
});

test('kernel spec points to bundled executable, includes only managed PYTHONPATH and locks Jupyter', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'euler-jupyter-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const packagesRoot = path.join(root, 'packages');
  const env = makeIsolatedEnvironment({
    runtimeRoot: path.join(root, 'runtime'),
    dataRoot: path.join(root, 'data'),
    userPackagesRoot: packagesRoot,
  });
  await Promise.all([
    fs.mkdir(env.JUPYTER_DATA_DIR, { recursive: true }),
    fs.mkdir(env.JUPYTER_CONFIG_DIR, { recursive: true }),
  ]);
  const bundled = path.join(root, 'runtime', process.platform === 'win32' ? 'python.exe' : 'bin/python3');
  await ensureBundledKernelSpec(env, bundled);
  const spec = JSON.parse(await fs.readFile(path.join(env.JUPYTER_DATA_DIR, 'kernels', 'python3', 'kernel.json'), 'utf8'));
  assert.equal(spec.argv[0], bundled);
  assert.equal(spec.display_name, 'Euler Python');
  assert.equal(spec.env.PYTHONPATH, packagesRoot);

  await writeJupyterConfig(env, { workspaceRoot: path.join(root, 'workspace'), port: 12345, token: 'secret' });
  const config = await fs.readFile(path.join(env.JUPYTER_CONFIG_DIR, 'jupyter_lab_config.py'), 'utf8');
  assert.match(config, /terminals_enabled = False/);
  assert.match(config, /allowed_kernelspecs = \{"python3"\}/);
  assert.match(config, /expose_app_in_browser = True/);
  assert.match(config, /extension_manager = \"readonly\"/);
  assert.match(config, /lock_all_plugins = True/);
  assert.match(config, /news_url = None/);
});

test('submit() is injected through IPython startup and only talks to a tokenized localhost bridge', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'euler-submit-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = makeIsolatedEnvironment({ runtimeRoot: path.join(root, 'runtime'), dataRoot: path.join(root, 'data') });
  await writeSubmitStartup(env, { port: 43123, token: 'bridge-secret' });
  const startup = await fs.readFile(
    path.join(env.IPYTHONDIR, 'profile_default', 'startup', '00-euler-workbench.py'),
    'utf8'
  );
  assert.match(startup, /def submit\(value\):/);
  assert.match(startup, /http:\/\/127\.0\.0\.1:43123\/submit/);
  assert.match(startup, /Bearer/);
  assert.match(startup, /bridge-secret/);
  assert.doesNotMatch(startup, /click\(/);
});
