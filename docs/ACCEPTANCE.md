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
12. User notebooks live outside the install directory and survive app upgrades.
13. Windows, macOS and Linux package builds are produced from the same source tree, each containing its platform-specific bundled CPython runtime.
