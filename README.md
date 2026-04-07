# FlowSwitch

**FlowSwitch** is a desktop workspace automation app: define **profiles** that launch applications, open browser tabs, adjust volume, and restore window layouts across monitors—then switch contexts with one action.

It is built with **Electron**, **React**, **TypeScript**, **Vite**, and **Tailwind CSS**. **Windows** is the primary target today (installed-app discovery, shortcuts, and layout capture lean on Windows APIs).

---

## Features

- **Profiles** — Multiple profiles with apps, files, browser tabs, per-monitor layout, volume, schedules, and startup options.
- **Persistence** — Profiles are stored under the Electron **userData** directory (`profiles.v1.json`). When the OS supports it, payloads are encrypted with Electron **safeStorage**; otherwise the app falls back to plain JSON.
- **Import / export** — Profiles can be exported and re-imported as JSON from the UI.
- **Installed apps** — Scans start-menu shortcuts, registry entries, and related sources; surfaces icons and metadata (including shortcut paths and app-protocol launch URLs where available).
- **Layout capture** — Capture running windows and minimized apps and map them to monitors for editing and launch.
- **Secure renderer bridge** — Preload exposes a small `window.electron` API over **contextBridge**; the main process validates IPC and sanitizes persisted fields (icon paths, launch URLs, shortcut paths).
- **Stability** — GPU acceleration is disabled in the main process to avoid known Electron GPU crashes on some setups.

---

## Tech stack

| Layer | Technology |
|--------|------------|
| Shell | Electron |
| UI | React 18, TypeScript, Tailwind CSS, Radix UI primitives, Lucide icons |
| Build | Vite 5 |
| Main process | Node.js (CommonJS `main.js`), Windows integrations (`winreg`, `windows-shortcuts`, `icon-extractor`) |
| IPC | `ipcMain.handle` / `ipcRenderer.invoke` via preload |

---

## Prerequisites

- **Node.js** 18+
- **Git**
- **Windows** (recommended for full functionality)

---

## Getting started

```bash
git clone https://github.com/jmpanackal/FlowSwitch.git
cd FlowSwitch
npm install
npm run dev
```

`npm run dev` runs the Vite dev server and Electron together (port **5173** is freed automatically via `predev` when possible).

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite + Electron in parallel |
| `npm run dev:frontend` | Vite only (UI in the browser) |
| `npm run dev:electron` | Electron only (expects built or served UI) |
| `npm run build` | Production build of the renderer into `dist/` |
| `npm run lint` | ESLint (main, preload, config) |
| `npm run typecheck` | TypeScript check against a baseline (CI-friendly) |
| `npm run typecheck:full` | Full `tsc --noEmit` |
| `npm test` | Node test runner |

---

## Project layout

```text
FlowSwitch/
├── public/                      # Static assets (Vite / Electron)
│   ├── flowswitch-logo.png      # In-app logo and default window icon
│   └── flowswitch-taskbar.png   # Windows taskbar-optimized icon (trimmed)
├── src/
│   ├── main/
│   │   ├── main.js              # Electron main entry: window, IPC, launch, capture
│   │   ├── registryApps.js      # Registry-based app discovery
│   │   ├── scanExeFiles.js      # Optional exe scanning
│   │   ├── services/            # profile-store, icon-service, windows-process-service
│   │   └── utils/               # profile-icon-paths, profile-launch-fields, …
│   ├── preload.js               # contextBridge API → `window.electron`
│   ├── renderer/
│   │   ├── main.tsx             # React entry
│   │   ├── App.tsx              # Renders MainLayout
│   │   ├── layout/              # MainLayout + monitor/app/profile UI
│   │   └── hooks/               # e.g. useInstalledApps
│   └── types/                   # preload.d.ts, profile.ts, …
├── dist/                        # Vite output (after `npm run build`; gitignored)
├── scripts/                     # Dev helpers (port free, typecheck baseline)
├── AGENTS.md                    # Contributor git / QA expectations
└── package.json
```

---

## Renderer API (`window.electron`)

Exposed from `src/preload.js` (typed in `src/types/preload.d.ts`), including:

- `launchProfile(profileId)`
- `getInstalledApps()`
- `captureRunningAppLayout()`, `getSystemMonitors()`
- `listProfiles()`, `saveProfiles(profiles)`

---

## Contributing

See **[AGENTS.md](./AGENTS.md)** for branch naming, commit conventions, and the default QA checklist (lint, typecheck, build, manual flows).
