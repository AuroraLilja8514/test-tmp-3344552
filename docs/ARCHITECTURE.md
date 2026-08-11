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
  rightNotebookProblemId = 17   <- remains visible

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
<resources>/runtime/python/python.exe       Windows
<resources>/runtime/python/bin/python3      macOS/Linux
```

There is no production fallback to `python`, `python3`, Conda or a virtualenv on the host.

The Jupyter process receives a newly constructed environment rather than `process.env`. Host Python variables are omitted and PATH is replaced by runtime-only executable paths. App-private HOME/Jupyter/IPython/Matplotlib directories prevent normal user configuration from changing the embedded environment.

The app creates an app-private `python3/kernel.json` on every launch with `argv[0]` equal to the actual bundled interpreter path. `KernelSpecManager.allowed_kernelspecs` permits only `python3`, so a host Conda/Jupyter installation cannot appear as an alternative kernel.

## Persistence

`state.json` under Electron `userData` stores only:

- last Project Euler URL;
- last opened problem notebook ID;
- pane split ratio.

Writes use temp-file + rename atomic replacement.

Project Euler website cookies are persisted separately by Electron's `persist:project-euler-workbench-euler` partition.

User notebooks live under the normal Documents directory and survive app replacement or upgrade.

## Failure behavior

- Save failure during navigation: cancel the transition and show error state.
- Save failure during exit: keep app open by default; explicit **Close anyway** is available.
- Missing bundled runtime: show a clear startup error; never fall back to host Python.
- Jupyter server startup failure: keep the website pane available and show the failure in the right pane/status.
- External link: open using the operating system browser instead of allowing arbitrary sites to replace the Project Euler pane.
