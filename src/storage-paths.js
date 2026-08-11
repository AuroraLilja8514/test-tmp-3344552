'use strict';

const path = require('node:path');

function resolveStoragePaths({
  isPackaged,
  executablePath,
  userDataPath,
  sessionDataPath,
  documentsPath,
}) {
  if (isPackaged) {
    if (!executablePath) throw new Error('Packaged storage requires an executable path');
    const appRoot = path.dirname(path.resolve(executablePath));
    const dataRoot = path.join(appRoot, 'data');
    return {
      portable: true,
      appRoot,
      dataRoot,
      userDataRoot: path.join(dataRoot, 'electron-user-data'),
      sessionDataRoot: path.join(dataRoot, 'electron-session-data'),
      runtimeStateRoot: path.join(dataRoot, 'runtime-state'),
      workspaceRoot: path.join(dataRoot, 'workspace'),
      stateFile: path.join(dataRoot, 'state.json'),
      tempRoot: path.join(dataRoot, 'tmp'),
      crashDumpsRoot: path.join(dataRoot, 'crash-dumps'),
    };
  }

  if (!userDataPath || !sessionDataPath || !documentsPath) {
    throw new Error('Development storage requires Electron user/session/documents paths');
  }

  return {
    portable: false,
    appRoot: null,
    dataRoot: null,
    userDataRoot: userDataPath,
    sessionDataRoot: sessionDataPath,
    runtimeStateRoot: path.join(userDataPath, 'runtime-state'),
    workspaceRoot: path.join(documentsPath, 'Project Euler Workspace'),
    stateFile: path.join(userDataPath, 'state.json'),
    tempRoot: null,
    crashDumpsRoot: null,
  };
}

module.exports = { resolveStoragePaths };
