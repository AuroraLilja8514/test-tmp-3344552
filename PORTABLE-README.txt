Project Euler Workbench v0.2.1 Portable
======================================

This file describes the ZIP/tar.gz portable edition. The Windows Release also
contains a separate NSIS installer.

Windows portable
----------------
1. Download euler-workbench-0.2.1-win-x64.zip.
2. Extract the entire ZIP archive to a writable folder.
3. Run euler-workbench.exe.

Linux portable
--------------
1. Download euler-workbench-0.2.1-linux-x64.tar.gz.
2. Extract the entire archive to a writable folder.
3. Run ./euler-workbench.

Portable data
-------------
On first launch the portable application creates a data/ folder beside the
executable. That folder contains notebooks, application state, Project Euler
login/session data, Jupyter/IPython configuration, runtime state, crash data,
and temporary files used by the bundled Python/Jupyter environment.

The Python/Jupyter runtime itself is bundled under resources/runtime/python.
The target computer does not need Python, Conda, Jupyter, or Node.js.

To move the portable application to another computer or drive, close it first
and copy or move the entire extracted folder, including data/.

Do not run the program directly from inside a ZIP viewer. Extract it first.
Avoid read-only locations because the portable application must be able to
create and update its neighboring data/ folder.

Installed Windows edition
-------------------------
The Windows setup executable is a different distribution mode. It stores
notebooks in Documents/Project Euler Workspace and uses the normal per-user
Electron data locations instead of a neighboring data/ folder. This keeps
installed user work outside the application installation directory.

Migration from v0.1.0
---------------------
v0.1.0 stored notebooks under Documents/Project Euler Workspace. The installed
v0.2.1 edition continues to use that workspace. The portable edition does not
copy it automatically. To bring existing notebooks into the portable edition,
close the app and copy the contents of the old workspace to:

  data/workspace/

Project Euler website login data is not automatically copied between installed
and portable editions.
