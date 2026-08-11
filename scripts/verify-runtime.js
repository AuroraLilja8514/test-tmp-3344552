'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', 'runtime', 'python');
const python = process.platform === 'win32'
  ? path.join(root, 'python.exe')
  : path.join(root, 'bin', 'python3');

if (!fs.existsSync(python)) {
  console.error(`Bundled runtime is missing: ${python}`);
  console.error('Run: npm run prepare:runtime');
  process.exit(1);
}

const env = { ...process.env, PATH: path.dirname(python), PYTHONNOUSERSITE: '1' };
delete env.PYTHONPATH;
delete env.PYTHONHOME;
delete env.VIRTUAL_ENV;
delete env.CONDA_PREFIX;

const code = `
import json, os, sys
import jupyterlab, ipykernel, numpy, sympy, scipy, mpmath, matplotlib, networkx
print(json.dumps({
  "executable": os.path.realpath(sys.executable),
  "prefix": os.path.realpath(sys.prefix),
  "base_prefix": os.path.realpath(sys.base_prefix),
}))
`;
const result = spawnSync(python, ['-I', '-c', code], { env, encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stderr || 'Runtime verification failed\n');
  process.exit(result.status || 1);
}
const info = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
const normalizedRoot = fs.realpathSync(root);
if (!path.resolve(info.executable).startsWith(path.resolve(normalizedRoot)) ||
    !path.resolve(info.prefix).startsWith(path.resolve(normalizedRoot))) {
  console.error('Runtime isolation failed:', info);
  process.exit(1);
}
console.log('Bundled runtime verified:', info);
