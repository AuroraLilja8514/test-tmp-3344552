Project Euler Workbench v0.2.0 Portable
======================================

No installer is required.

Windows
-------
1. Extract the entire ZIP archive to a writable folder.
2. Run euler-workbench.exe.

Linux
-----
1. Extract the entire tar.gz archive to a writable folder.
2. Run ./euler-workbench.

Portable data
-------------
On first launch the application creates a data/ folder beside the executable.
That folder contains notebooks, application state, Project Euler login/session
data, Jupyter/IPython configuration, runtime state, crash data, and temporary
files used by the bundled Python/Jupyter environment.

The Python/Jupyter runtime itself is bundled under resources/runtime/python.
The target computer does not need Python, Conda, Jupyter, Node.js, or an
installer.

To move the application to another computer or drive, close it first and copy
or move the entire extracted folder, including data/.

Do not run the program directly from inside a ZIP viewer. Extract it first.
Avoid read-only locations because the application must be able to create and
update its neighboring data/ folder.

Migration from v0.1.0
---------------------
v0.1.0 stored notebooks under Documents/Project Euler Workspace. v0.2.0 does
not copy that directory automatically. To bring existing notebooks into the
portable edition, close the app and copy the contents of the old workspace to:

  data/workspace/

Project Euler website login data from v0.1.0 is not automatically migrated.
