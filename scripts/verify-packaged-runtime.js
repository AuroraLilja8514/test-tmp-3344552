'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DIST_ROOT = path.resolve(__dirname, '..', 'dist');

function isDirectory(value) {
  try {
    return fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
}

function runtimePython(runtimeRoot) {
  return process.platform === 'win32'
    ? path.join(runtimeRoot, 'python.exe')
    : path.join(runtimeRoot, 'bin', 'python3');
}

function findPackagedRuntimeRoots() {
  if (!isDirectory(DIST_ROOT)) return [];

  const found = [];
  const queue = [{ dir: DIST_ROOT, depth: 0 }];

  while (queue.length) {
    const { dir, depth } = queue.shift();
    if (depth > 7) continue;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);

      if (entry.name.toLowerCase() === 'resources') {
        const runtimeRoot = path.join(child, 'runtime', 'python');
        const python = runtimePython(runtimeRoot);
        if (fs.existsSync(python)) found.push(runtimeRoot);
        // Never recurse into Resources: the bundled Python tree is very large.
        continue;
      }

      queue.push({ dir: child, depth: depth + 1 });
    }
  }

  return [...new Set(found.map((item) => path.resolve(item)))];
}

function isolatedEnvironment(runtimeRoot) {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const bins = process.platform === 'win32'
    ? [runtimeRoot, path.join(runtimeRoot, 'Scripts')]
    : [path.join(runtimeRoot, 'bin')];
  env.PATH = bins.join(path.delimiter);
  env.PYTHONNOUSERSITE = '1';
  env.PYTHONSAFEPATH = '1';
  env.PYTHONUTF8 = '1';
  return env;
}

function verifyRuntime(runtimeRoot) {
  const python = runtimePython(runtimeRoot);
  const buildInfo = path.join(runtimeRoot, '.euler-build-info.json');
  if (!fs.existsSync(buildInfo)) {
    throw new Error(`Missing build marker in packaged runtime: ${buildInfo}`);
  }

  const code = [
    'import json, os, sys',
    'import jupyterlab, jupyter_server, ipykernel, nbformat',
    'import numpy, sympy, scipy, mpmath, matplotlib, networkx',
    'print(json.dumps({"executable": os.path.realpath(sys.executable), "prefix": os.path.realpath(sys.prefix)}))',
  ].join('; ');

  const result = spawnSync(python, ['-I', '-c', code], {
    cwd: runtimeRoot,
    env: isolatedEnvironment(runtimeRoot),
    encoding: 'utf8',
    timeout: 60_000,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Packaged Python failed (status ${result.status}).\n${result.stderr || result.stdout || ''}`
    );
  }

  const line = result.stdout.trim().split(/\r?\n/).at(-1);
  const info = JSON.parse(line);
  const realRoot = fs.realpathSync(runtimeRoot);
  const relativePrefix = path.relative(realRoot, info.prefix);
  const relativeExecutable = path.relative(realRoot, info.executable);
  const outside = (relative) => relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);

  if (outside(relativePrefix) || outside(relativeExecutable)) {
    throw new Error(`Packaged runtime escaped its app resources: ${JSON.stringify(info)}`);
  }

  console.log(`Packaged runtime verified at ${runtimeRoot}`);
  console.log(JSON.stringify(info));
}

const runtimes = findPackagedRuntimeRoots();
if (runtimes.length === 0) {
  console.error(`No packaged runtime found under ${DIST_ROOT}`);
  process.exit(1);
}
if (runtimes.length !== 1) {
  console.error(`Expected one unpacked application runtime, found ${runtimes.length}:`);
  for (const item of runtimes) console.error(`- ${item}`);
  process.exit(1);
}

try {
  verifyRuntime(runtimes[0]);
} catch (error) {
  console.error(error);
  process.exit(1);
}
