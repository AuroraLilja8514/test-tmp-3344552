# Project Euler Workbench

A self-contained desktop Project Euler workspace with the Project Euler website on the left and JupyterLab/Python on the right.

> This is an unofficial tool and is not affiliated with Project Euler.

## v0.2.1 downloads

v0.2.1 provides both an installed and a portable Windows edition, while Linux remains portable-only:

- Windows x64 installer: `euler-workbench-0.2.1-win-x64-setup.exe`
- Windows x64 portable: `euler-workbench-0.2.1-win-x64.zip`
- Linux x64 portable: `euler-workbench-0.2.1-linux-x64.tar.gz`

macOS is not built.

All distributions include their own Python, JupyterLab, IPython kernel and scientific packages. The target computer does not need Python, Conda, Jupyter or Node.js installed.

## Windows installer

Run `euler-workbench-0.2.1-win-x64-setup.exe` to install the application normally. The installer creates an `installed.mode` marker in the application directory. On startup that marker tells Project Euler Workbench to use installed-mode storage:

```text
Documents/
└── Project Euler Workspace/
    └── problems/
        └── NNNN/
            ├── solution.ipynb
            └── problem.json
```

Electron profile/session state and Jupyter application state use normal per-user application-data locations. User notebooks therefore remain outside the installation directory and are not owned by the application binaries.

The installer is NSIS-based and keeps application data on uninstall (`deleteAppDataOnUninstall: false`).

## Portable edition

For Windows portable use, download the ZIP, extract the whole archive to a writable folder, and run `euler-workbench.exe`. On Linux, extract the `tar.gz` and run `./euler-workbench`.

On first portable launch the app creates `data/` beside the executable:

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
    ├── electron-user-data/
    ├── electron-session-data/   # persistent Project Euler login/cookies
    ├── runtime-state/
    ├── crash-dumps/
    ├── tmp/
    └── state.json
```

Close the application before moving it. Copying the **entire portable folder including `data/`** carries notebooks, application state and the Project Euler login session with it. Do not run the program directly from inside a ZIP viewer; extract it first.

Installed and portable editions intentionally keep separate profile/session data. To move notebooks between them, copy the relevant workspace contents manually.

## What it does

The application opens maximized and presents two panes:

- **Left:** a persistent Chromium session for `projecteuler.net`.
- **Right:** JupyterLab running on the Python runtime bundled with the application.

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

`problem.json` contains only local bookkeeping (`id`, canonical URL, creation/open timestamps). The application does not scrape or duplicate the Project Euler problem statement.

## Runtime isolation

Production builds **never resolve `python` from the host PATH**. The build downloads a relocatable CPython distribution from `astral-sh/python-build-standalone`, installs the declared packages into it, and places that complete runtime under `resources/runtime/python`.

At application startup:

- Jupyter is launched by absolute path through the bundled Python;
- host `PYTHONPATH`, virtualenv and Conda settings are not inherited;
- PATH contains only bundled-runtime executable directories;
- Python user-site packages are disabled;
- only the bundled `python3` kernelspec is allowed and displayed as **Euler Python**;
- Jupyter terminals are disabled;
- JupyterLab extension installation is read-only and plugins are locked;
- the server listens only on `127.0.0.1` with a fresh random token each launch.

The bundled runtime includes JupyterLab/IPython plus NumPy, SymPy, SciPy, mpmath, Matplotlib and NetworkX.

## Development

For development/building only:

- Node.js 22+
- npm
- `tar`
- Internet access for downloading Electron, CPython and Python wheels

```bash
npm install
npm run prepare:runtime
npm run verify:runtime
npm start
```

The application intentionally refuses to fall back to a system Python if `runtime/python` is missing.

## Tests and packaging

```bash
npm test
npm run test:jupyter
npm run verify:runtime
npm run dist
npm run verify:package
npm run verify:portable
```

Electron Builder targets:

- Windows: NSIS installer + ZIP portable archive
- Linux: `tar.gz` portable archive

CI verifies the self-contained Python runtime, Jupyter integration, portable layout, Windows installer artifact and exact final Release asset set before publishing.

## Save semantics

JupyterLab is launched with `LabApp.expose_app_in_browser=True`. Electron calls JupyterLab's asynchronous `docmanager:save-all` command and waits for completion before navigation, problem switching or exit. If saving fails during navigation, the page transition is cancelled. If final save fails during exit, **Keep open** is the default action.

Only the currently opened problem keeps a Jupyter session. Before switching notebooks the app saves all documents and deletes existing Jupyter sessions, which shuts down the previous kernel.

## Security notes

- Jupyter listens on loopback only.
- A random 256-bit token is generated on every launch.
- Jupyter terminals and extension installation are disabled.
- External links open in the system browser.
- Electron renderers use context isolation, sandboxing and no Node integration.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the state machine and storage-mode design.
