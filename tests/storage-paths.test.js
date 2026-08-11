'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { INSTALLED_MODE_MARKER, resolveStoragePaths } = require('../src/storage-paths');

function assertInside(root, target) {
  const relative = path.relative(root, target);
  assert.notEqual(relative, '..');
  assert.ok(!relative.startsWith(`..${path.sep}`));
  assert.ok(!path.isAbsolute(relative));
}

test('packaged portable builds keep every persistent path beside the executable', () => {
  const executablePath = path.join(path.sep, 'portable', 'euler-workbench.exe');
  const expectedAppRoot = path.dirname(path.resolve(executablePath));
  const paths = resolveStoragePaths({ isPackaged: true, isInstalled: false, executablePath });

  assert.equal(paths.portable, true);
  assert.equal(paths.installed, false);
  assert.equal(paths.appRoot, expectedAppRoot);
  assert.equal(paths.dataRoot, path.join(paths.appRoot, 'data'));
  assert.equal(paths.workspaceRoot, path.join(paths.dataRoot, 'workspace'));
  assert.equal(paths.userPackagesRoot, path.join(paths.dataRoot, 'python-packages'));
  assert.equal(paths.settingsRoot, path.join(paths.dataRoot, 'settings'));
  assert.equal(paths.stateFile, path.join(paths.dataRoot, 'state.json'));

  for (const target of [
    paths.dataRoot,
    paths.userDataRoot,
    paths.sessionDataRoot,
    paths.runtimeStateRoot,
    paths.userPackagesRoot,
    paths.settingsRoot,
    paths.workspaceRoot,
    paths.stateFile,
    paths.tempRoot,
    paths.crashDumpsRoot,
  ]) {
    assertInside(paths.appRoot, target);
  }
});

test('packaged installed builds keep notebooks and user packages outside the installation directory', () => {
  const installRoot = path.join(path.sep, 'Program Files', 'Euler Workbench');
  const paths = resolveStoragePaths({
    isPackaged: true,
    isInstalled: true,
    executablePath: path.join(installRoot, 'euler-workbench.exe'),
    userDataPath: path.join(path.sep, 'user', 'appdata'),
    sessionDataPath: path.join(path.sep, 'user', 'session'),
    documentsPath: path.join(path.sep, 'user', 'Documents'),
  });

  assert.equal(paths.portable, false);
  assert.equal(paths.installed, true);
  assert.equal(paths.userDataRoot, path.join(path.sep, 'user', 'appdata'));
  assert.equal(paths.sessionDataRoot, path.join(path.sep, 'user', 'session'));
  assert.equal(paths.runtimeStateRoot, path.join(path.sep, 'user', 'appdata', 'runtime-state'));
  assert.equal(paths.userPackagesRoot, path.join(path.sep, 'user', 'appdata', 'python-packages'));
  assert.equal(paths.settingsRoot, path.join(path.sep, 'user', 'appdata', 'settings'));
  assert.equal(paths.workspaceRoot, path.join(path.sep, 'user', 'Documents', 'Project Euler Workspace'));
  assert.equal(paths.stateFile, path.join(path.sep, 'user', 'appdata', 'state.json'));
  assert.equal(paths.dataRoot, null);
  assert.equal(paths.workspaceRoot.startsWith(installRoot), false);
  assert.equal(paths.userPackagesRoot.startsWith(installRoot), false);
});

test('development builds preserve normal Electron and Documents locations', () => {
  const paths = resolveStoragePaths({
    isPackaged: false,
    executablePath: '/ignored/electron',
    userDataPath: '/home/user/appdata',
    sessionDataPath: '/home/user/session',
    documentsPath: '/home/user/Documents',
  });

  assert.equal(paths.portable, false);
  assert.equal(paths.installed, false);
  assert.equal(paths.userDataRoot, '/home/user/appdata');
  assert.equal(paths.sessionDataRoot, '/home/user/session');
  assert.equal(paths.runtimeStateRoot, path.join('/home/user/appdata', 'runtime-state'));
  assert.equal(paths.userPackagesRoot, path.join('/home/user/appdata', 'python-packages'));
  assert.equal(paths.settingsRoot, path.join('/home/user/appdata', 'settings'));
  assert.equal(paths.workspaceRoot, path.join('/home/user/Documents', 'Project Euler Workspace'));
  assert.equal(paths.stateFile, path.join('/home/user/appdata', 'state.json'));
});

test('installed-mode marker name is stable so installer upgrades keep storage mode', () => {
  assert.equal(INSTALLED_MODE_MARKER, 'installed.mode');
});
