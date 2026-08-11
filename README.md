# Project Euler Workbench

A desktop Project Euler workspace with the Project Euler website on the left and a self-contained JupyterLab/Python environment on the right.

> This is an unofficial tool and is not affiliated with Project Euler.

## What it does

The application opens maximized and presents two panes:

- **Left:** a persistent Chromium session for `projecteuler.net`.
- **Right:** JupyterLab running on the Python runtime bundled inside the application.

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

The Project Euler login cookie is stored in an Electron persistent partition, so logging in is a normal website operation and the login persists between launches.

## Notebook storage

User work is deliberately stored outside the application installation directory:

```text
Documents/
└── Project Euler Workspace/
    └── problems/
        ├── 0001/
        │   ├── solution.ipynb
        │   └── problem.json
        ├── 0187/
        │   ├── solution.ipynb
        │   └── problem.json
        └── ...
```

`problem.json` contains only local bookkeeping (`id`, canonical URL, creation/open timestamps). The application does not scrape or duplicate the Project Euler problem statement.

## Runtime isolation

Production builds **never resolve `python` from the host PATH**.

The build downloads a relocatable CPython distribution from `astral-sh/python-build-standalone`, installs the declared scientific/Jupyter packages into it, and places that complete runtime in the packaged application.

At application startup:

- the Jupyter Server executable is the absolute path to the bundled Python;
- `PYTHONPATH`, virtualenv and Conda environment variables are not inherited;
- the process PATH contains only bundled-runtime executable directories;
- Python user-site packages are disabled;
- Jupyter configuration/data/home directories are private to the app;
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

## Build prerequisites

For development/building only:

- Node.js 22+
- npm
- `tar`
- Internet access for downloading Electron, CPython and Python wheels

The target machine running a packaged build does **not** need Python, Conda, Jupyter or Node installed.

## Prepare the bundled runtime

```bash
npm run prepare:runtime
npm run verify:runtime
```

`prepare:runtime` automatically selects the current platform/architecture and fetches the latest stable CPython 3.13 `install_only_stripped` artifact from python-build-standalone. If GitHub provides an asset SHA-256 digest, it is verified before extraction.

Supported build targets:

- Windows x64 / arm64
- macOS x64 / arm64
- Linux x64 / arm64 (glibc)

Set `EULER_PYTHON_SERIES` to override the default Python series during a build.

## Development

```bash
npm install
npm run prepare:runtime
npm start
```

The application intentionally refuses to fall back to a system Python if `runtime/python` is missing.

## Tests

Pure application logic:

```bash
npm test
```

Jupyter server/runtime integration:

```bash
npm run test:jupyter
```

Runtime isolation:

```bash
npm run verify:runtime
```

## Packaging

```bash
npm run dist
```

Electron Builder targets:

- Windows: NSIS installer + portable executable
- macOS: DMG + ZIP
- Linux: AppImage + `tar.gz`

The runtime is copied with `extraResources`, not packed inside `app.asar`, so the embedded interpreter remains executable.

## Save semantics

JupyterLab is launched with `LabApp.expose_app_in_browser=True`. Electron therefore calls JupyterLab's own asynchronous `docmanager:save-all` command and waits for it to finish.

A problem-page navigation that requires leaving the current problem is cancelled first. Only after the notebook save succeeds does the application perform the browser navigation. The same save barrier is used for Back, Forward, Home, Reload, problem switching and application exit.

If a save fails during ordinary navigation, the left page stays where it is. If the final save fails during application exit, the default action is **Keep open**.

## Kernel lifecycle

Only the currently opened problem keeps a Jupyter session. Before switching notebooks the app saves all documents and deletes existing Jupyter sessions, which shuts down the previous kernel. This avoids accumulating a kernel for every visited Project Euler problem and favors reproducible notebooks that can be rerun from a clean kernel.

## Security notes

- Jupyter listens on loopback only.
- A random 256-bit token is generated on every launch.
- Jupyter terminals are disabled.
- Extension installation is disabled.
- External links from Project Euler are opened in the system browser.
- Electron renderers use `contextIsolation`, sandboxing, and no Node integration.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the state machine and component design.
