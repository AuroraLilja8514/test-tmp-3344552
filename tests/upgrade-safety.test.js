'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');

test('Windows installer keeps a stable app identity and does not request AppData deletion', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.build.appId, 'dev.euler.workbench');
  assert.ok(pkg.build.win.target.includes('nsis'));
  assert.ok(pkg.build.win.target.includes('zip'));
  assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
});

test('fresh portable packaging verification rejects bundled user data', async () => {
  const verifier = await fs.readFile(path.join(repositoryRoot, 'scripts', 'verify-portable-package.js'), 'utf8');
  assert.match(verifier, /unexpectedly contains user data/i);
  assert.match(verifier, /path\.join\(layout\.unpacked, 'data'\)/);
});

test('NSIS installation marker is recreated during installer upgrades', async () => {
  const script = await fs.readFile(path.join(repositoryRoot, 'build', 'installer.nsh'), 'utf8');
  assert.match(script, /customInstall/);
  assert.match(script, /installed\.mode/);
});
