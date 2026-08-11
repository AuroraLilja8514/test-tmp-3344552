'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { JupyterManager } = require('../src/jupyter');

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      ...options,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Child process failed code=${code} signal=${signal}: ${stderr || stdout}`));
    });
  });
}

async function main() {
  const runtimeRoot = process.env.EULER_RUNTIME_ROOT || path.join(__dirname, '..', 'runtime', 'python');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'euler-jupyter-smoke-'));
  const workspaceRoot = path.join(root, 'workspace');
  const packagesRoot = path.join(root, 'python-packages');
  await fs.mkdir(workspaceRoot, { recursive: true });

  const manager = new JupyterManager({
    runtimeRoot,
    dataRoot: path.join(root, 'data'),
    workspaceRoot,
    userPackagesRoot: packagesRoot,
    log: { info() {}, warn: console.warn },
  });
  let submittedValue = null;
  manager.setSubmitHandler(async (value) => {
    submittedValue = value;
    return { message: `Smoke accepted ${value}` };
  });

  try {
    await manager.start();
    if (manager.env.PYTHONPATH !== undefined) {
      throw new Error('Jupyter Server unexpectedly received the managed package PYTHONPATH');
    }

    const kernelsResponse = await manager._fetch('/api/kernelspecs');
    if (!kernelsResponse.ok) throw new Error(`kernelspec API HTTP ${kernelsResponse.status}`);
    const kernels = await kernelsResponse.json();
    const names = Object.keys(kernels.kernelspecs || {});
    if (names.length !== 1 || names[0] !== 'python3') {
      throw new Error(`Expected only python3 kernelspec, got: ${names.join(', ')}`);
    }
    if (kernels.kernelspecs.python3.spec.display_name !== 'Euler Python') {
      throw new Error('python3 kernelspec is not the bundled Euler Python kernel');
    }
    if (kernels.kernelspecs.python3.spec.env?.PYTHONPATH !== packagesRoot) {
      throw new Error('Euler Python kernel does not expose exactly the Workbench-managed package layer');
    }

    const terminals = await manager._fetch('/api/terminals');
    if (terminals.status !== 404) {
      throw new Error(`Expected terminals to be disabled (404), got HTTP ${terminals.status}`);
    }

    const lab = await manager._fetch('/lab');
    const html = await lab.text();
    if (!html.includes('"exposeAppInBrowser": true')) {
      throw new Error('JupyterLab did not expose its app command interface');
    }
    if (!html.includes('"can_install": false')) {
      throw new Error('JupyterLab extension manager is not read-only');
    }

    const ipython = await run(manager.pythonExecutable, [
      '-m', 'IPython', '--no-banner', '-c', 'submit(123456)',
    ], { env: manager.env, cwd: workspaceRoot });
    if (submittedValue !== '123456') {
      throw new Error(`submit() bridge did not receive the expected answer: ${submittedValue}`);
    }
    if (!ipython.stdout.includes('Smoke accepted 123456')) {
      throw new Error(`submit() did not print the bridge confirmation: ${ipython.stdout}`);
    }

    console.log('Jupyter smoke test passed: isolated server, managed kernel packages, terminals disabled, save command bridge, and submit() bridge enabled.');
  } finally {
    await manager.shutdown();
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
