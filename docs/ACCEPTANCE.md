# Acceptance criteria

The application is considered functionally complete when all of the following hold.

1. It opens maximized with Project Euler on the left and the notebook workspace on the right.
2. Project Euler login/list/account/forum pages remain usable and never create a problem notebook.
3. Entering `/problem=N` opens or creates exactly `problems/NNNN/solution.ipynb`.
4. Leaving a problem page cannot proceed until the current notebook save completes.
5. Problem N → Problem M saves N before opening M.
6. Closing the app saves first; save failure keeps the app open by default.
7. Login cookies survive application restart.
8. Packaged builds run on a machine with no system Python/Jupyter installation.
9. A machine that does have Python/Conda installed still runs `Euler Python` from the bundled runtime.
10. Only one kernelspec is presented and Jupyter terminals are disabled.
11. Old problem kernels are shut down when switching problems.
12. v0.2.0 production builds require no installation: extracting the archive and launching the executable is sufficient.
13. In packaged builds, notebooks, app state, Electron profile/session data, Jupyter state, crash dumps and configured temporary files are all rooted under the `data/` directory beside the executable.
14. Moving the complete extracted folder while the app is closed preserves notebooks and the persistent Project Euler session.
15. A non-writable portable folder causes a visible startup error instead of silently writing to a per-user directory.
16. Fresh release archives contain no user `data/` directory.
17. Windows x64 is released as a ZIP archive and Linux x64 as a `tar.gz` archive; macOS, Windows installers and Linux AppImage are not produced for v0.2.0.
18. The final release assets use the short names `euler-workbench-0.2.0-win-x64.zip` and `euler-workbench-0.2.0-linux-x64.tar.gz`.
