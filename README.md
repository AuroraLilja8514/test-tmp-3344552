# Project Euler Workbench

A portable desktop Project Euler workspace with the Project Euler website on the left and a self-contained JupyterLab/Python environment on the right.

> This is an unofficial tool and is not affiliated with Project Euler.

## v0.2.0 portable edition

v0.2.0 is distributed as an **extract-and-run folder**, not an installer.

Official release packages:

- Windows x64: `euler-workbench-0.2.0-win-x64.zip`
- Linux x64: `euler-workbench-0.2.0-linux-x64.tar.gz`

macOS packages, Windows installers, the single-file Electron Builder `portable` target, and Linux AppImage packages are intentionally not produced.

To use it, extract the complete archive to a writable folder and run:

- Windows: `euler-workbench.exe`
- Linux: `./euler-workbench`

The target computer does **not** need Python, Conda, Jupyter, Node.js, or an installer.

## Portable folder layout

The bundled application and Python/Jupyter runtime are part of the extracted folder. On first launch the app creates a neighboring `data/` directory:

```text
Project Euler Workbench/
├── euler-workbench.exe          # Windows (Linux: euler-workbench)
├── PORTABLE-README.txt
├── resources/
│   └── runtime/
│       └── python/              # complete bundled Python/Jupyter environment
└── data/                        # created on first launch
    ├── workspace/
    │   └── problems/
    │       ├── 0001/
    │       │   ├── solution.ipynb
    │       │   └── problem.json
    │       └── ...
    ├── electron-user-data/
    ├── electron-session-data/   # persistent Project Euler website session/cookies
    ├── runtime-state/           # Jupyter/IPython/Matplotlib private state
    ├── crash-dumps/
    ├── tmp/
    └── state.json
```

Close the application before moving it. Copying or moving the **entire extracted folder including `data/`** carries the workbench state, notebooks and Project Euler login session with it.

The folder must be writable. Do not run the executable directly from inside a ZIP viewer.

Some operating-system components can still use OS-managed transient scratch space; the application's own persistent data, bundled runtime and configured Python/Jupyter temporary area are kept in the portable folder.

### Migrating from v0.1.0

v0.1.0 stored notebooks under:

```text
Documents/Project Euler Workspace/
```

v0.2.0 does not silently migrate that directory. To reuse those notebooks, close v0.2.0 and copy the contents of the old workspace into:

```text
data/workspace/
```

The old Electron website-login data is not automatically migrated.

## What it does

The application opens maximized and presents two panes:

- **Left:** a persistent Chromium session for `projecteuler.net`.
- **Right:** JupyterLab running on the Python runtime bundled inside the application folder.

Only a URL of the exact form `https://projecteuler.net/problem=N` binds a problem to a notebook.

| Left page | Notebook behavior |
| --- | --- |
| `/problem=N` | Create/open `problems/NNNN/solution.ipynb` |
| Problem N → Problem M | Save N, stop its Jupyter session, open M |
| Problem → archives/list/login/account/forum | Save the current notebook; keep it visible; clear the page binding |
| archives/list/login/account/forum → Problem M | Save the visible last notebook if needed, then open M |
| Non-problem → non-problem | No notebook is created or switched |
| External link | Open in the system browser; the left pane stays on Project Euler |
| App exit | Save first; if saving fails, default to keeping the app open |

The Project Euler login cookie is stored in an Electron persistent partition under the portable `data/` directory, so the login survives restarts and moves with the folder.

`problem.json` contains only local bookkeeping (`id`, canonical URL, creation/open timestamps). The application does not scrape or duplicate the Project Euler problem statement.

## Runtime isolation

Production builds **never resolve `python` from the host PATH**.

The build downloads a relocatable CPython distribution from `astral-sh/python-build-standalone`, installs the declared scientific/Jupyter packages into it, and places that complete runtime under `resources/runtime/python` in the packaged folder.

At application startup:

- the Jupyter Server executable is the absolute path to the bundled Python;
- `PYTHONPATH`, virtualenv and Conda environment variables are not inherited;
- the process PATH contains only bundled-runtime executable directories;
- Python user-site packages are disabled;
- Jupyter configuration/data/home directories are private to the portable `data/` tree;
- only the `python3` kernelspec is allowed;
- that kernelspec uses the bundled Python absolute path and is displayed as **Euler Python**;
- Jupyter terminals are disabled;
- JupyterLab extension installation is read-only and plugins are locked;
- the server listens only on `127.0.0.1` and uses a fresh random token each launch.

This isolates the Python/Jupyter environment. It is not intended to be an operating-system sandbox: Python code can still call OS APIs if the user explicitly writes code to do so.

## Included Python packages

The bundled runtime is built from `runtime/requirements.txt` and includes JupyterLab/IPython plus common Project Euler tools:

- NumPy
- SymPy
- SciPy
- mpmath
- Matplotlib
- NetworkX

## Development and build prerequisites

For development/building only:

- Node.js 22+
- npm
- `tar`
- Internet access for downloading Electron, CPython and Python wheels

Prepare the bundled runtime:

```bash
npm run prepare:runtime
npm run verify:runtime
```

Development:

```bash
npm install
npm run prepare:runtime
npm start
```

The application intentionally refuses to fall back to a system Python if `runtime/python` is missing.

## Tests

```bash
npm test
npm run test:jupyter
npm run verify:runtime
```

After packaging, CI additionally runs:

```bash
npm run verify:package
npm run verify:portable
```

`verify:portable` checks the expected short archive name, extracted executable, root portable README and bundled Python, and fails if a fresh package accidentally contains user `data/`.

## Packaging

```bash
npm run dist
```

Electron Builder targets:

- Windows: ZIP directory archive
- Linux: `tar.gz` directory archive

The runtime is copied with `extraResources`, not packed inside `app.asar`, so the embedded interpreter remains executable. `PORTABLE-README.txt` is copied to the root of each extracted package.

## Save semantics

JupyterLab is launched with `LabApp.expose_app_in_browser=True`. Electron therefore calls JupyterLab's own asynchronous `docmanager:save-all` command and waits for it to finish.

A problem-page navigation that requires leaving the current problem is cancelled first. Only after the notebook save succeeds does the application perform the browser navigation. The same save barrier is used for Back, Forward, Home, Reload, problem switching and application exit.

If a save fails during ordinary navigation, the left page stays where it is. If the final save fails during application exit, the default action is **Keep open**.

## Kernel lifecycle

Only the currently opened problem keeps a Jupyter session. Before switching notebooks the app saves all documents and deletes existing Jupyter sessions, which shuts down the previous kernel.

## Security notes

- Jupyter listens on loopback only.
- A random 256-bit token is generated on every launch.
- Jupyter terminals are disabled.
- Extension installation is disabled.
- External links from Project Euler are opened in the system browser.
- Electron renderers use `contextIsolation`, sandboxing, and no Node integration.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the state machine and component design.
