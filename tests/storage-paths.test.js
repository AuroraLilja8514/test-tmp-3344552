'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveStoragePaths } = require('../src/storage-paths');

function assertInside(root, target) {
  const relative = path.relative(root, target);
  assert.notEqual(relative, '..');
  assert.ok(!relative.startsWith(`..${path.sep}`));
  assert.ok(!path.isAbsolute(relative));
}

test('packaged builds keep every persistent path beside the executable', () => {
  const executablePath = path.join(path.sep, 'portable', 'euler-workbench.exe');
  const expectedAppRoot = path.dirname(path.resolve(executablePath));
  const paths = resolveStoragePaths({ isPackaged: true, executablePath });

  assert.equal(paths.portable, true);
  assert.equal(paths.appRoot, expectedAppRoot);
  assert.equal(paths.dataRoot, path.join(paths.appRoot, 'data'));
  assert.equal(paths.workspaceRoot, path.join(paths.dataRoot, 'workspace'));
  assert.equal(paths.stateFile, path.join(paths.dataRoot, 'state.json'));

  for (const target of [
    paths.dataRoot,
    paths.userDataRoot,
    paths.sessionDataRoot,
    paths.runtimeStateRoot,
    paths.workspaceRoot,
    paths.stateFile,
    paths.tempRoot,
    paths.crashDumpsRoot,
  ]) {
    assertInside(paths.appRoot, target);
  }
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
  assert.equal(paths.userDataRoot, '/home/user/appdata');
  assert.equal(paths.sessionDataRoot, '/home/user/session');
  assert.equal(paths.runtimeStateRoot, path.join('/home/user/appdata', 'runtime-state'));
  assert.equal(paths.workspaceRoot, path.join('/home/user/Documents', 'Project Euler Workspace'));
  assert.equal(paths.stateFile, path.join('/home/user/appdata', 'state.json'));
});
