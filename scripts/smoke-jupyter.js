'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { JupyterManager } = require('../src/jupyter');

async function main() {
  const runtimeRoot = process.env.EULER_RUNTIME_ROOT || path.join(__dirname, '..', 'runtime', 'python');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'euler-jupyter-smoke-'));
  const workspaceRoot = path.join(root, 'workspace');
  await fs.mkdir(workspaceRoot, { recursive: true });

  const manager = new JupyterManager({
    runtimeRoot,
    dataRoot: path.join(root, 'data'),
    workspaceRoot,
    log: { info() {}, warn: console.warn },
  });

  try {
    await manager.start();
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

    console.log('Jupyter smoke test passed: isolated kernel, terminals disabled, save command bridge enabled.');
  } finally {
    await manager.shutdown();
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
