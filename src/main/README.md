# Main process layout

- **`services/`** — Stateful orchestration, I/O, and cross-run concerns (profile store, process enumeration, window readiness, **launch status store**, placement trackers). Prefer new launch-pipeline modules here per `docs/superpowers/specs/workflow-orchestration-rewrite-plan.md` §5.2.
- **`utils/`** — Pure or mostly pure helpers: sanitization, diagnostics formatting, field transforms, and small algorithms with no retained process state.
- **`main.js`** — Electron app/bootstrap, IPC registration, and orchestration wiring; keep complex domain logic in `services/` or `utils/` instead of growing this file.

When unsure: if it needs a `Map` of live run state or is part of the IPC contract surface, use **`services/`**.
