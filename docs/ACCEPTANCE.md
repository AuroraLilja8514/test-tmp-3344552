# Acceptance criteria

The application is considered functionally complete when all of the following hold.

## Core navigation and persistence

1. It opens maximized with Project Euler on the left, JupyterLab on the right and problem/workbench status at the top.
2. Project Euler login/list/account/forum pages remain usable and never create a problem notebook.
3. Entering `/problem=N` opens or creates exactly `problems/NNNN/solution.ipynb`.
4. A newly created notebook has one empty Python code cell and Workbench identity metadata; existing notebooks are never rewritten merely by migration/open.
5. Leaving a problem page cannot proceed until the current notebook save completes.
6. Problem N → Problem M saves N and shuts down old Jupyter sessions before opening M.
7. Closing the app saves first; save failure keeps the app open by default.
8. Project Euler login cookies survive application restart in the selected storage mode.

## Python/Jupyter isolation

9. Packaged builds run without system Python/Jupyter.
10. Host Python/Conda/PYTHONPATH does not alter Jupyter Server or Euler Python.
11. Only one kernelspec is presented and Jupyter terminals are disabled.
12. Jupyter Server imports only from the bundled base runtime; the managed user package path is added only to the Euler Python kernel.

## Problem workflow

13. Problem status supports `Not Started`, `In Progress` and `Solved` and persists locally.
14. Dashboard shows locally known problems, status, solution count, last-opened time and latest Run All duration.
15. `Run All + Save` uses JupyterLab's command interface, waits for execution, saves and records elapsed time/run count.
16. Every Euler Python kernel exposes `submit(value)` automatically.
17. `submit(value)` communicates only through a tokenized localhost bridge, requires the left pane to be a Project Euler problem, fills the answer input and never activates the site's submit control.

## Multiple solutions, snippets, search and statistics

18. `solution.ipynb` remains the editable working/draft notebook.
19. Saved alternatives are created only by explicit user action and receive stable IDs `s001`, `s002`, etc.; saving a solution never replaces the working notebook.
20. Workbench ships no solution/algorithm snippets. A snippet can only be created from user-supplied active-cell source and retains local provenance.
21. Search covers source text in working notebooks, saved solutions, user snippets and generated Markdown articles.
22. Statistics are derived from local workspace data and include problem status counts, solution counts, multiple-solution problems, snippets, articles and Run All activity.

## Managed Python packages

23. Package installation/listing uses the bundled Python and a persistent user package directory outside the replaceable base runtime.
24. Package removal is confined to files belonging to a matching distribution inside that managed directory and cannot delete paths outside it or bundled-runtime files.
25. Package changes survive normal installed-app upgrades and portable program-file replacements.

## AI / articles

26. Users can configure a full OpenAI-compatible completion endpoint, custom model and temperature.
27. AI generation sends only notebook sources explicitly selected by the user; Project Euler pages are not scraped for AI.
28. Multiple selected solutions can be used for a comparison analysis.
29. Generated output is stored as an independent editable Markdown article with source metadata.
30. API keys are session-only by default; when remembered they use Electron OS secure storage and plaintext keys are never written to settings JSON.

## Distribution and upgrades

31. Windows x64 is released as both NSIS installer and extract-and-run ZIP; Linux x64 as portable `tar.gz`; macOS is not produced.
32. The installer writes `installed.mode` and keeps notebooks under `Documents/Project Euler Workspace`; user settings/packages/profile data use normal per-user application-data locations outside the installation directory.
33. Installer configuration retains the stable `appId` and `deleteAppDataOnUninstall: false`, so normal upgrades replace program files rather than treating user directories as application payload.
34. Portable mode keeps all persistent state under neighboring `data/`, including workspace, settings and `python-packages`.
35. Fresh portable release archives contain no user `data/` directory and no installed-mode marker.
36. v0.3.0 Release assets are exactly `euler-workbench-0.3.0-win-x64-setup.exe`, `euler-workbench-0.3.0-win-x64.zip`, and `euler-workbench-0.3.0-linux-x64.tar.gz`.
