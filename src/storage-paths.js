'use strict';

const path = require('node:path');

const INSTALLED_MODE_MARKER = 'installed.mode';

function resolveNormalStorage({ userDataPath, sessionDataPath, documentsPath, installed }) {
  if (!userDataPath || !sessionDataPath || !documentsPath) {
    throw new Error('Normal storage requires Electron user/session/documents paths');
  }

  return {
    portable: false,
    installed,
    appRoot: null,
    dataRoot: null,
    userDataRoot: userDataPath,
    sessionDataRoot: sessionDataPath,
    runtimeStateRoot: path.join(userDataPath, 'runtime-state'),
    userPackagesRoot: path.join(userDataPath, 'python-packages'),
    settingsRoot: path.join(userDataPath, 'settings'),
    workspaceRoot: path.join(documentsPath, 'Project Euler Workspace'),
    stateFile: path.join(userDataPath, 'state.json'),
    tempRoot: null,
    crashDumpsRoot: null,
  };
}

function resolveStoragePaths({
  isPackaged,
  isInstalled = false,
  executablePath,
  userDataPath,
  sessionDataPath,
  documentsPath,
}) {
  if (isPackaged && !isInstalled) {
    if (!executablePath) throw new Error('Packaged portable storage requires an executable path');
    const appRoot = path.dirname(path.resolve(executablePath));
    const dataRoot = path.join(appRoot, 'data');
    return {
      portable: true,
      installed: false,
      appRoot,
      dataRoot,
      userDataRoot: path.join(dataRoot, 'electron-user-data'),
      sessionDataRoot: path.join(dataRoot, 'electron-session-data'),
      runtimeStateRoot: path.join(dataRoot, 'runtime-state'),
      userPackagesRoot: path.join(dataRoot, 'python-packages'),
      settingsRoot: path.join(dataRoot, 'settings'),
      workspaceRoot: path.join(dataRoot, 'workspace'),
      stateFile: path.join(dataRoot, 'state.json'),
      tempRoot: path.join(dataRoot, 'tmp'),
      crashDumpsRoot: path.join(dataRoot, 'crash-dumps'),
    };
  }

  return resolveNormalStorage({
    userDataPath,
    sessionDataPath,
    documentsPath,
    installed: Boolean(isPackaged && isInstalled),
  });
}

module.exports = { INSTALLED_MODE_MARKER, resolveStoragePaths };
