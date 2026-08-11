'use strict';

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME_DIR = path.join(ROOT, 'runtime', 'python');
const DOWNLOAD_DIR = path.join(ROOT, 'runtime', '.download');
const REQUIREMENTS = path.join(ROOT, 'runtime', 'requirements.txt');
const PYTHON_SERIES = process.env.EULER_PYTHON_SERIES || '3.13';
const PBS_REPO = 'astral-sh/python-build-standalone';

function targetTriple() {
  const key = `${process.platform}-${process.arch}`;
  const table = {
    'win32-x64': 'x86_64-pc-windows-msvc',
    'win32-arm64': 'aarch64-pc-windows-msvc',
    'darwin-x64': 'x86_64-apple-darwin',
    'darwin-arm64': 'aarch64-apple-darwin',
    'linux-x64': 'x86_64-unknown-linux-gnu',
    'linux-arm64': 'aarch64-unknown-linux-gnu',
  };
  const triple = table[key];
  if (!triple) throw new Error(`Unsupported build platform: ${key}`);
  return triple;
}

async function githubJson(url) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'project-euler-workbench-runtime-builder',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  return response.json();
}


async function listReleaseAssets(assetsUrl) {
  const all = [];
  for (let page = 1; page <= 20; page += 1) {
    const batch = await githubJson(`${assetsUrl}?per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) return all;
  }
  throw new Error('Release asset pagination exceeded the safety limit');
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fsSync.createReadStream(filePath);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function versionTuple(assetName) {
  const match = assetName.match(/^cpython-(\d+)\.(\d+)\.(\d+)\+/);
  return match ? match.slice(1).map(Number) : [0, 0, 0];
}

function compareVersionDesc(a, b) {
  const av = versionTuple(a.name);
  const bv = versionTuple(b.name);
  for (let i = 0; i < 3; i += 1) {
    if (av[i] !== bv[i]) return bv[i] - av[i];
  }
  return a.name.localeCompare(b.name);
}

function selectAsset(release, triple) {
  const prefix = `cpython-${PYTHON_SERIES}.`;
  const preferredSuffix = `-${triple}-install_only_stripped.tar.gz`;
  const fallbackSuffix = `-${triple}-install_only.tar.gz`;

  const stable = release.assets.filter((asset) =>
    asset.name.startsWith(prefix) && !/[abrc]\d+\+/.test(asset.name)
  );
  const preferred = stable.filter((asset) => asset.name.endsWith(preferredSuffix)).sort(compareVersionDesc);
  const fallback = stable.filter((asset) => asset.name.endsWith(fallbackSuffix)).sort(compareVersionDesc);
  const selected = preferred[0] || fallback[0];
  if (!selected) {
    throw new Error(`No CPython ${PYTHON_SERIES} install-only asset for ${triple} in release ${release.tag_name}`);
  }
  return selected;
}

async function download(url, destination) {
  const headers = { 'User-Agent': 'project-euler-workbench-runtime-builder' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(url, { headers, redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const file = fsSync.createWriteStream(destination);
  await new Promise((resolve, reject) => {
    const reader = response.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!file.write(Buffer.from(value))) await new Promise((r) => file.once('drain', r));
        }
        file.end(resolve);
      } catch (error) {
        file.destroy();
        reject(error);
      }
    };
    pump();
    file.on('error', reject);
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code=${code} signal=${signal}`));
    });
  });
}

async function findPythonRoot(searchRoot) {
  const queue = [searchRoot];
  while (queue.length) {
    const current = queue.shift();
    const python = process.platform === 'win32'
      ? path.join(current, 'python.exe')
      : path.join(current, 'bin', 'python3');
    if (fsSync.existsSync(python)) return current;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) queue.push(path.join(current, entry.name));
    }
  }
  throw new Error('Could not locate the extracted Python runtime');
}

async function copyDirectoryContents(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    await fs.cp(path.join(source, entry.name), path.join(destination, entry.name), {
      recursive: true,
      force: true,
      dereference: false,
    });
  }
}

function runtimePython() {
  return process.platform === 'win32'
    ? path.join(RUNTIME_DIR, 'python.exe')
    : path.join(RUNTIME_DIR, 'bin', 'python3');
}

function isolatedBuildEnv() {
  const env = { ...process.env };
  delete env.PYTHONPATH;
  delete env.PYTHONHOME;
  delete env.VIRTUAL_ENV;
  delete env.CONDA_PREFIX;
  env.PYTHONNOUSERSITE = '1';
  env.PYTHONUTF8 = '1';
  return env;
}

async function pipAvailable(python) {
  return new Promise((resolve) => {
    const child = spawn(python, ['-I', '-m', 'pip', '--version'], { stdio: 'ignore', env: isolatedBuildEnv() });
    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));
  });
}

async function main() {
  const triple = targetTriple();
  console.log(`Preparing bundled CPython ${PYTHON_SERIES} for ${triple}`);

  const release = await githubJson(`https://api.github.com/repos/${PBS_REPO}/releases/latest`);
  release.assets = await listReleaseAssets(release.assets_url);
  const asset = selectAsset(release, triple);
  console.log(`Using ${asset.name}`);

  await fs.rm(DOWNLOAD_DIR, { recursive: true, force: true });
  await fs.rm(RUNTIME_DIR, { recursive: true, force: true });
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

  const archive = path.join(DOWNLOAD_DIR, asset.name);
  await download(asset.browser_download_url, archive);
  if (typeof asset.digest === 'string' && asset.digest.startsWith('sha256:')) {
    const expected = asset.digest.slice('sha256:'.length).toLowerCase();
    const actual = (await sha256File(archive)).toLowerCase();
    if (actual !== expected) throw new Error(`SHA-256 mismatch for ${asset.name}`);
    console.log('SHA-256 verified.');
  }

  const extractDir = path.join(DOWNLOAD_DIR, 'extracted');
  await fs.mkdir(extractDir, { recursive: true });
  await run('tar', ['-xzf', archive, '-C', extractDir]);
  const extractedRoot = await findPythonRoot(extractDir);
  await copyDirectoryContents(extractedRoot, RUNTIME_DIR);

  const python = runtimePython();
  if (!(await pipAvailable(python))) {
    await run(python, ['-I', '-m', 'ensurepip', '--upgrade'], { env: isolatedBuildEnv() });
  }
  await run(python, ['-I', '-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'], { env: isolatedBuildEnv() });
  await run(python, ['-I', '-m', 'pip', 'install', '--upgrade', '-r', REQUIREMENTS], { env: isolatedBuildEnv() });

  const buildInfo = {
    generatedAt: new Date().toISOString(),
    pythonSeries: PYTHON_SERIES,
    pythonBuildStandaloneRelease: release.tag_name,
    asset: asset.name,
    targetTriple: triple,
  };
  await fs.writeFile(path.join(RUNTIME_DIR, '.euler-build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`, 'utf8');

  await run(python, ['-I', '-c', [
    'import sys, json',
    'import jupyterlab, jupyter_server, ipykernel, nbformat',
    'import numpy, sympy, scipy, mpmath, matplotlib, networkx',
    'print(json.dumps({"executable": sys.executable, "version": sys.version}))',
  ].join('; ')], { env: isolatedBuildEnv() });

  await fs.rm(DOWNLOAD_DIR, { recursive: true, force: true });
  console.log('Bundled runtime is ready.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
