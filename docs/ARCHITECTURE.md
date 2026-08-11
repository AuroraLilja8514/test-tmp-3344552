# Architecture

## Process and UI layout

```text
Main BrowserWindow
├── local toolbar/status renderer
├── WebContentsView: Project Euler (persistent partition)
└── WebContentsView: JupyterLab (127.0.0.1:<random>)

Tools BrowserWindow
└── sandboxed local UI
    ├── Dashboard / Solutions / Snippets
    ├── Search / Statistics
    ├── Packages
    └── AI / Articles

Main process
├── AppController
├── JupyterManager
└── WorkbenchService
    ├── workspace metadata / solution snapshots
    ├── SnippetStore
    ├── search / statistics
    ├── ManagedPackageManager
    ├── AIManager
    └── ArticleStore
```

Both renderers are sandboxed, use context isolation and have no Node integration. They call narrow preload IPC APIs; persistent-file, process, network-provider and Jupyter operations remain in the main process.

## Page/notebook state machine

Two IDs are intentionally independent:

- `activePageProblemId`: exact Project Euler problem currently shown on the left, or `null` on non-problem pages.
- `rightNotebookProblemId`: problem whose working notebook is currently visible on the right.

A non-problem Project Euler page therefore does not create/switch notebooks and can leave the prior notebook visible. Navigations away from a problem are cancelled first, then the right notebook is saved, then the controlled navigation proceeds.

## Working notebook and local metadata

Each known problem uses:

```text
problems/NNNN/
├── solution.ipynb          editable working/draft notebook
├── problem.json            local status/run metadata
├── solutions.json          explicit saved-solution index
├── solutions/
│   ├── s001.ipynb
│   └── ...
└── articles/
    └── a001/
        ├── article.md
        └── article.json
```

A new `solution.ipynb` contains one empty Python code cell plus Workbench metadata. `ensureProblemWorkspace()` never overwrites an existing notebook. `problem.json` is incrementally normalized so older metadata keeps its creation time and unknown fields.

Saved solutions are explicit file copies of the saved working notebook. Stable IDs are monotonically allocated; no automatic checkpoint stream is treated as a user solution.

## Jupyter control bridge

JupyterLab is launched with `LabApp.expose_app_in_browser=True`. Electron calls JupyterLab commands instead of simulating keys or menus:

- save barrier: `docmanager:save-all`;
- Run All: `notebook:run-all-cells` followed by save;
- snippet insertion: `notebook:insert-cell-below` then write the new active cell's shared model.

Active-cell snippet extraction reads the current NotebookPanel active cell through the exposed JupyterLab application. If a future JupyterLab release makes this adapter unstable, the same boundary can be hardened as a small JupyterLab plugin using the official notebook tracker; the workspace/service contracts do not depend on that UI mechanism.

Problem changes use Jupyter Server REST `/api/sessions` to delete old sessions. Kernel restart uses the matching session's `/api/kernels/{id}/restart` endpoint.

## `submit(value)` bridge

Before kernels are started, Workbench writes an IPython startup file into the private `IPYTHONDIR`. It defines global `submit(value)` without modifying user notebooks.

```text
Euler Python kernel
  submit(value)
      │ HTTP POST + random bearer token
      ▼
127.0.0.1:<random>/submit
      │ main-process validation
      ▼
AppController.fillAnswer()
      │
      ▼
Project Euler WebContentsView
  set answer input value
  dispatch input/change
  focus input
  never click submit
```

The bridge accepts only one-line bounded strings. Electron separately requires the left pane to be an exact Project Euler problem page before it touches the DOM.

## Python environment layers

There are deliberately two Python layers:

```text
resources/runtime/python/       replaceable bundled base runtime
<persistent>/python-packages/   user-managed extension layer
```

`JupyterManager.env` is constructed from scratch and does not inherit host `PYTHONPATH`, virtualenv or Conda state. **Jupyter Server does not receive the user package layer on PYTHONPATH.**

The generated Euler Python kernelspec points to the bundled interpreter and adds only the persistent `python-packages/` directory as `PYTHONPATH`. This lets notebook code import GUI-installed packages without allowing those packages to shadow Jupyter Server's own modules.

`ManagedPackageManager` always launches the bundled interpreter. It uses:

- `pip install --target <python-packages>` for install/upgrade;
- `pip list --path <python-packages>` for inventory.

Uninstall is intentionally not general `pip uninstall`: Workbench finds matching `.dist-info` only under the managed directory, reads its `RECORD`, refuses paths outside the managed root, removes listed managed files and then removes empty directories. The base runtime is outside this deletion boundary.

## User snippets and search

Global user snippets live under workspace `.workbench/snippets/`. No built-in solution/algorithm snippets are shipped. Snippet creation requires active user cell source and records optional source-problem provenance.

Search recursively indexes source content on demand from `.ipynb`, `.py` and `.md` artifacts, skipping notebook checkpoints and oversized files. Notebook outputs are not indexed.

Statistics are derived on demand from local problem metadata, saved-solution indices, snippet index and article directories; there is no second authoritative statistics database to synchronize.

## AI provider and article flow

`AIManager` stores non-secret provider configuration under persistent `settings/ai.json`. API keys are kept only in process memory unless the user explicitly enables remembered-key storage; remembered keys are encrypted by Electron `safeStorage` before base64 encoding, so plaintext keys are not written to the settings file.

Generation is explicit:

```text
selected working notebook and/or saved solutions
       │ read code/Markdown source only
       ▼
Workbench grounding prompt
       │ OpenAI-compatible completion endpoint
       ▼
Markdown response
       │
       ▼
articles/aNNN/article.md + article.json
```

The Project Euler page is not scraped for AI. Article metadata records selected local sources, model and endpoint. Markdown remains editable independently of the source notebooks.

## Distribution/storage modes and upgrades

### Installed Windows

NSIS creates `<install-root>/installed.mode`. Startup detects the marker before persistent Electron sessions are created.

```text
<install-root>/                  replaceable program/runtime files
Documents/Project Euler Workspace/  notebooks/solutions/articles/snippets
<Electron userData>/
├── python-packages/
├── settings/
├── runtime-state/
└── state.json
```

Electron profile/session data also use normal per-user locations. The stable `appId` identifies subsequent installers as the same application and `deleteAppDataOnUninstall` remains false. Program/runtime updates therefore do not need to move user workspace/package/settings files through the installation directory.

### Portable Windows/Linux

No installed marker is present. Before Electron becomes ready, Workbench maps persistent paths under executable-adjacent `data/`:

```text
<portable-root>/
├── resources/runtime/python/
└── data/
    ├── workspace/
    ├── python-packages/
    ├── settings/
    ├── electron-user-data/
    ├── electron-session-data/
    ├── runtime-state/
    ├── crash-dumps/
    ├── tmp/
    └── state.json
```

Release archives contain no `data/`. A portable update therefore replaces program/runtime files while the existing `data/` must be retained.

## Release targets

v0.3.0:

- Windows x64 NSIS installer;
- Windows x64 portable ZIP;
- Linux x64 portable `tar.gz`;
- no macOS build.

CI verifies unit invariants, Jupyter/IPython integration including the live `submit()` localhost bridge, bundled runtime isolation, unpacked package layout and the exact three Release assets.

## Failure behavior

- Save failure during navigation: cancel transition.
- Save failure during exit: default **Keep open**.
- Missing bundled runtime: visible error; never fall back to host Python.
- Non-writable portable root: visible startup error; no silent per-user fallback.
- Invalid/not-current Project Euler answer form: `submit()` returns an error and does not submit anything.
- Package install failure: retain the base runtime; report pip output.
- AI endpoint/key/configuration failure: report error and do not create a fabricated article artifact.
