'use strict';

const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');

const dist = path.resolve(__dirname, '..', 'dist');

function mustExist(target, label) {
  if (!fs.existsSync(target)) {
    throw new Error(`Missing ${label}: ${target}`);
  }
}

function platformLayout() {
  if (process.platform === 'win32') {
    return {
      unpacked: path.join(dist, 'win-unpacked'),
      executable: 'euler-workbench.exe',
      artifact: `euler-workbench-${pkg.version}-win-${process.arch}.zip`,
      runtimePython: path.join('resources', 'runtime', 'python', 'python.exe'),
    };
  }
  if (process.platform === 'linux') {
    return {
      unpacked: path.join(dist, 'linux-unpacked'),
      executable: 'euler-workbench',
      artifact: `euler-workbench-${pkg.version}-linux-${process.arch}.tar.gz`,
      runtimePython: path.join('resources', 'runtime', 'python', 'bin', 'python3'),
    };
  }
  throw new Error(`Portable release verification is not supported on ${process.platform}`);
}

try {
  const layout = platformLayout();
  mustExist(layout.unpacked, 'unpacked application directory');
  mustExist(path.join(layout.unpacked, layout.executable), 'portable application executable');
  mustExist(path.join(layout.unpacked, 'PORTABLE-README.txt'), 'portable README');
  mustExist(path.join(layout.unpacked, layout.runtimePython), 'bundled Python executable');
  mustExist(path.join(dist, layout.artifact), 'portable archive artifact');

  const unexpectedData = path.join(layout.unpacked, 'data');
  if (fs.existsSync(unexpectedData)) {
    throw new Error(`Fresh portable package unexpectedly contains user data: ${unexpectedData}`);
  }

  console.log(`Portable package verified: ${layout.artifact}`);
  console.log(`Executable: ${path.join(layout.unpacked, layout.executable)}`);
  console.log(`Bundled Python: ${path.join(layout.unpacked, layout.runtimePython)}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
