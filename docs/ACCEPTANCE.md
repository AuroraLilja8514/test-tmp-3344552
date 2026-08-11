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
12. Windows x64 is released in two forms: an NSIS installer and an extract-and-run ZIP portable archive.
13. Linux x64 is released as an extract-and-run `tar.gz` portable archive; macOS is not produced.
14. The Windows installer creates `installed.mode` in the installation directory so the application can select installed storage semantics.
15. Installed mode keeps notebooks under `Documents/Project Euler Workspace` and uses normal per-user Electron data locations, outside the installation directory.
16. Portable mode roots notebooks, app state, Electron profile/session data, Jupyter state, crash dumps and configured temporary files under `data/` beside the executable.
17. Moving the complete portable folder while the app is closed preserves notebooks and the persistent Project Euler session.
18. A non-writable portable folder causes a visible startup error instead of silently falling back to a per-user directory.
19. Fresh portable release archives contain no user `data/` directory and no `installed.mode` marker.
20. v0.2.1 Release assets are exactly `euler-workbench-0.2.1-win-x64-setup.exe`, `euler-workbench-0.2.1-win-x64.zip`, and `euler-workbench-0.2.1-linux-x64.tar.gz`.
