'use strict';

const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');

function validatePackageSpec(value) {
  const spec = String(value || '').trim();
  if (!spec || spec.length > 512 || /[\r\n\0]/.test(spec)) {
    throw new TypeError('Package specification must be a single non-empty line');
  }
  return spec;
}

function validatePackageName(value) {
  const name = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new TypeError('Invalid package name');
  }
  return name;
}

function runProcess(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      ...options,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const limit = 2 * 1024 * 1024;
    child.stdout.on('data', (chunk) => { if (stdout.length < limit) stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { if (stderr.length < limit) stderr += String(chunk); });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      const result = { code, signal, stdout, stderr };
      if (code === 0) resolve(result);
      else {
        const error = new Error((stderr || stdout || `pip exited with code ${code}`).trim());
        error.result = result;
        reject(error);
      }
    });
  });
}

class ManagedPackageManager {
  constructor({ pythonExecutable, packagesRoot, baseEnv }) {
    this.pythonExecutable = pythonExecutable;
    this.packagesRoot = packagesRoot;
    this.baseEnv = { ...(baseEnv || {}) };
  }

  async ensureRoot() {
    await fs.mkdir(this.packagesRoot, { recursive: true });
  }

  environment() {
    return {
      ...this.baseEnv,
      PYTHONPATH: this.packagesRoot,
      PIP_DISABLE_PIP_VERSION_CHECK: '1',
      PIP_NO_INPUT: '1',
    };
  }

  async list() {
    await this.ensureRoot();
    const result = await runProcess(this.pythonExecutable, [
      '-m', 'pip', 'list', '--format=json', '--path', this.packagesRoot,
    ], { env: this.environment() });
    const parsed = JSON.parse(result.stdout || '[]');
    return Array.isArray(parsed)
      ? parsed.map((item) => ({ name: String(item.name), version: String(item.version) }))
      : [];
  }

  async install(specification) {
    const spec = validatePackageSpec(specification);
    await this.ensureRoot();
    const result = await runProcess(this.pythonExecutable, [
      '-m', 'pip', 'install', '--upgrade', '--no-warn-script-location',
      '--target', this.packagesRoot, spec,
    ], { env: this.environment() });
    return { specification: spec, output: (result.stdout + result.stderr).trim(), packages: await this.list() };
  }

  async uninstall(packageName) {
    const name = validatePackageName(packageName);
    await this.ensureRoot();
    const result = await runProcess(this.pythonExecutable, [
      '-m', 'pip', 'uninstall', '-y', name,
    ], { env: this.environment() });
    return { name, output: (result.stdout + result.stderr).trim(), packages: await this.list() };
  }
}

module.exports = {
  ManagedPackageManager,
  runProcess,
  validatePackageName,
  validatePackageSpec,
};
