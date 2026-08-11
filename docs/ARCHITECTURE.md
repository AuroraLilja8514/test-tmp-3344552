# Architecture

## Components

```text
BrowserWindow (local chrome/status UI)
│
├── WebContentsView: Project Euler
│     persistent website session
│
└── WebContentsView: JupyterLab
      127.0.0.1:<random port>
             │
             └── bundled CPython -> Jupyter Server -> IPython kernel
```

The BrowserWindow renderer only owns the toolbar, status bar and draggable divider. Website and Jupyter content run in separate sandboxed `WebContentsView` instances.

## Page state machine

There are two independent state variables:

- `activePageProblemId`: problem number represented by the **current left page**, or `null` on archives/login/account/etc.
- `rightNotebookProblemId`: problem number represented by the notebook currently visible on the **right**, or `null` before the first problem is opened.

They are deliberately not the same thing.

Example:

```text
/problem=17
  activePageProblemId = 17
  rightNotebookProblemId = 17

        click Archives
              │
              ├── save Problem 17
              ▼
/archives
  activePageProblemId = null
  rightNotebookProblemId = 17

        click Problem 18
              │
              ├── save visible notebook if changed
              ├── shut down old Jupyter session
              ▼
/problem=18
  activePageProblemId = 18
  rightNotebookProblemId = 18
```

This model prevents login/list/account pages from accidentally receiving fake notebook IDs while still leaving the user's last working notebook available.

## URL classification

A page is a problem only when all conditions hold:

1. hostname is exactly `projecteuler.net` or `www.projecteuler.net`;
2. pathname matches `^/problem=(\\d+)/?$`;
3. parsed ID is a positive safe integer.

No HTML scraping is used for normal problem identification.

## Controlled navigation

When the left pane is currently a problem page and a user navigation would leave that problem, the `will-navigate` event is cancelled. The controller saves first and only then performs the requested navigation. Toolbar Back/Forward/Reload/Home actions use the same save barrier.

## Jupyter save bridge

JupyterLab is started with `LabApp.expose_app_in_browser=True`. Electron waits for `window.jupyterapp.commands.execute` and then awaits `docmanager:save-all`. No keyboard simulation or DOM menu clicking is used.

## Jupyter session lifecycle

`JupyterManager.openNotebook()` follows:

```text
same notebook already open
  -> no reload

different notebook
  -> save-all
  -> GET /api/sessions
  -> DELETE every existing session
  -> load /lab/tree/problems/NNNN/solution.ipynb
  -> wait for window.jupyterapp
```

Deleting old sessions prevents orphan kernels from accumulating.

## Runtime isolation

The embedded CPython root is resolved only from application resources:

```text
<application-root>/resources/runtime/python/python.exe       Windows
<application-root>/resources/runtime/python/bin/python3      Linux
```

There is no production fallback to `python`, `python3`, Conda or a virtualenv on the host. Jupyter receives a newly constructed environment with host Python variables omitted and PATH replaced by bundled-runtime executable directories. Only the bundled `python3` kernelspec is exposed.

## Distribution and storage modes

v0.2.1 has two Windows distribution modes and one Linux distribution mode:

- Windows x64 NSIS installer
- Windows x64 ZIP portable archive
- Linux x64 `tar.gz` portable archive

macOS is not built.

### Mode detection

The NSIS installer runs `build/installer.nsh` and creates this file after installation:

```text
<install-root>/installed.mode
```

The ZIP/tar.gz application image does not contain that marker. During startup, before any persistent Electron session is created, the main process checks for `installed.mode` beside the executable and selects one of the two storage mappings below.

### Installed mode

Installed mode deliberately keeps user data outside the installation directory:

```text
Documents/Project Euler Workspace/
└── problems/NNNN/...

<Electron userData>/
├── state.json
└── runtime-state/...
```

Electron's normal per-user `userData` and `sessionData` locations are retained, so installed upgrades or uninstallation do not make the application installation directory the owner of notebooks or profile data.

### Portable mode

Portable mode derives its root from the actual executable path and creates:

```text
<portable-root>/data/
├── workspace/
├── electron-user-data/
├── electron-session-data/
├── runtime-state/
├── crash-dumps/
├── tmp/
└── state.json
```

Electron `userData`, `sessionData`, and `crashDumps` are redirected before persistent sessions are created. Application `TEMP`, `TMP`, and `TMPDIR` are pointed at `data/tmp` before Jupyter starts. Moving the complete portable folder while the application is closed therefore moves its notebooks, Project Euler session, application state, and bundled runtime together.

Native operating-system components can still use OS-managed transient scratch locations; portability here means the application's configured persistent state and bundled Python/Jupyter runtime do not depend on an installation or host Python environment.

## Packaging model

Electron Builder creates both Windows targets from the same source tree. The NSIS artifact has a distinct `-setup.exe` name while the ZIP retains the shorter portable name. Linux remains a `tar.gz` directory archive.

`extraResources` places the relocatable Python runtime under `resources/runtime/python`, and `extraFiles` places `PORTABLE-README.txt` in the application root. CI checks the bundled runtime, portable unpacked layout, expected installer artifact, and final Release asset set.

## Failure behavior

- Save failure during navigation: cancel the transition and show error state.
- Save failure during exit: keep app open by default; explicit **Close anyway** is available.
- Portable root not writable: show a startup error and exit instead of silently falling back to a user directory.
- Missing bundled runtime: show a clear startup error; never fall back to host Python.
- Jupyter server startup failure: keep the website pane available and show the failure in the right pane/status.
- External link: open using the operating system browser instead of allowing arbitrary sites to replace the Project Euler pane.
