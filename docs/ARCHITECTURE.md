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

When the left pane is currently a problem page and a user navigation would leave that problem, the `will-navigate` event is cancelled. The controller then performs:

```text
prevent navigation
      │
      ▼
JupyterLab docmanager:save-all
      │
      ├── failure -> remain on current page
      │
      ▼
controlled loadURL(target)
      │
      ▼
did-navigate
      │
      ├── non-problem -> clear activePageProblemId only
      │
      └── problem N   -> ensure/open N notebook
```

Toolbar history actions are programmatic Electron navigations, so the toolbar explicitly performs the same save barrier before invoking Back/Forward/Reload/Home.

## Jupyter save bridge

JupyterLab supports the `docmanager:save-all` command. The server is started with `LabApp.expose_app_in_browser=True`, causing the frontend application instance to be available as `window.jupyterapp`.

Electron waits until:

```javascript
window.jupyterapp?.commands?.execute
```

is available, then awaits:

```javascript
window.jupyterapp.commands.execute('docmanager:save-all')
```

No keyboard simulation and no DOM menu clicking are used.

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

Deleting the old sessions prevents orphan kernels from accumulating.

## Runtime isolation

The embedded CPython root is resolved only from application resources:

```text
<portable-root>/resources/runtime/python/python.exe       Windows
<portable-root>/resources/runtime/python/bin/python3      Linux
```

There is no production fallback to `python`, `python3`, Conda or a virtualenv on the host.

The Jupyter process receives a newly constructed environment rather than `process.env`. Host Python variables are omitted and PATH is replaced by runtime-only executable paths. App-private HOME/Jupyter/IPython/Matplotlib directories prevent normal user configuration from changing the embedded environment.

The app creates a private `python3/kernel.json` on every launch with `argv[0]` equal to the actual bundled interpreter path. `KernelSpecManager.allowed_kernelspecs` permits only `python3`, so a host Conda/Jupyter installation cannot appear as an alternative kernel.

## Portable persistence

v0.2.0 production builds use an extract-and-run directory model. Before Electron becomes ready, the application derives the portable root from the actual executable path and creates:

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

`src/storage-paths.js` centralizes this mapping. In packaged builds every persistent application path is below the executable's directory. Development mode deliberately preserves normal Electron user-data and Documents paths.

Electron `userData` and `sessionData` are redirected before any persistent `session` partition is created. This keeps Chromium profile data and the Project Euler persistent partition under the portable `data/` tree. `crashDumps` is redirected there as well. Application `TEMP`, `TMP`, and `TMPDIR` are also pointed to `data/tmp` before Jupyter starts, so the child environment inherits the portable temporary location.

The Jupyter runtime state root is `data/runtime-state`, and problem notebooks are stored under `data/workspace/problems/NNNN/`.

A packaged folder must therefore remain writable. Moving the entire folder while the application is closed moves the bundled runtime and persistent application data together.

Native operating-system components can still use OS-managed transient scratch locations; portability here means the application's bundled runtime and configured persistent state do not depend on an installation or a fixed per-user application directory.

## Packaging model

v0.2.0 intentionally does not use Electron Builder's single-file Windows `portable` target. Releases are folder archives:

- Windows x64: ZIP
- Linux x64: `tar.gz`

There is no macOS release, Windows installer, or Linux AppImage in v0.2.0.

`extraResources` places the relocatable Python runtime under `resources/runtime/python`, and `extraFiles` places `PORTABLE-README.txt` in the application root. CI checks both the unpacked application layout and the final archive name and rejects a fresh package that accidentally contains a `data/` directory.

## Failure behavior

- Save failure during navigation: cancel the transition and show error state.
- Save failure during exit: keep app open by default; explicit **Close anyway** is available.
- Portable root not writable: show a startup error and exit instead of silently falling back to a user directory.
- Missing bundled runtime: show a clear startup error; never fall back to host Python.
- Jupyter server startup failure: keep the website pane available and show the failure in the right pane/status.
- External link: open using the operating system browser instead of allowing arbitrary sites to replace the Project Euler pane.
