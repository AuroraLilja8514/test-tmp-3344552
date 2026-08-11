Project Euler Workbench v0.3.0 Portable
======================================

This file describes the ZIP/tar.gz portable edition. The Windows Release also
contains a separate NSIS installer.

Windows portable
----------------
1. Download euler-workbench-0.3.0-win-x64.zip.
2. Extract the entire ZIP archive to a writable folder.
3. Run euler-workbench.exe.

Linux portable
--------------
1. Download euler-workbench-0.3.0-linux-x64.tar.gz.
2. Extract the entire archive to a writable folder.
3. Run ./euler-workbench.

Portable data
-------------
On first launch the portable application creates data/ beside the executable.
It contains persistent user state including:

  data/workspace/                 notebooks, saved solutions, snippets, articles
  data/python-packages/           packages installed through the Packages UI
  data/settings/                  AI/provider settings
  data/electron-user-data/        Electron profile
  data/electron-session-data/     Project Euler login/session data
  data/runtime-state/             Jupyter/IPython runtime state
  data/tmp/                       Workbench temporary area
  data/crash-dumps/               crash information
  data/state.json                 application state

The replaceable bundled Python/Jupyter base runtime is under:

  resources/runtime/python/

The target computer does not need Python, Conda, Jupyter, or Node.js.

Updating the portable edition
-----------------------------
1. Close Project Euler Workbench.
2. Keep your existing data/ directory.
3. Extract the newer portable archive over the program files.

Release archives intentionally contain no data/ directory, so a normal
overwrite does not supply or replace user data. Do not delete the complete old
portable folder unless you have first copied data/ somewhere safe.

Moving the portable edition
---------------------------
Close the application, then copy the entire extracted folder including data/.
Notebooks, locally saved solutions, snippets, articles, package layer and the
Project Euler browser profile move with the folder.

If an AI API key was stored with OS secure storage, that encrypted value can be
bound to the original operating-system user/machine. Re-enter the key if the
remembered key cannot be decrypted after moving the folder.

Managed Python packages
-----------------------
Packages installed from the Workbench Packages UI are written only to

data/python-packages/

The Jupyter Server continues to use only the bundled base runtime; the Euler
Python kernel additionally sees the managed package directory. Package changes
therefore survive a program/runtime update. Restart the kernel after package
changes if a package was already imported.

Do not run the program directly from inside a ZIP viewer. Extract it first.
Avoid read-only locations because the portable application must update data/.

Installed Windows edition
-------------------------
The Windows setup executable is a different distribution mode. Installed
notebooks remain in Documents/Project Euler Workspace and settings/packages use
normal per-user application-data directories, so installing a newer setup
package replaces program files without placing user work in the install folder.
