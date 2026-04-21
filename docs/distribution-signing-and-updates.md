# Windows code signing and auto-updates

This document outlines the next distribution steps after you ship unsigned installers from GitHub Actions.

## Code signing (Windows)

- Unsigned builds often trigger **Microsoft SmartScreen** warnings until reputation accrues. A standard **Authenticode** certificate (OV or EV) reduces friction.
- Typical approach: purchase a cert from a Windows-trusted CA, then in CI set `CSC_LINK` (encrypted base64 PFX or Azure Key Vault reference) and `CSC_KEY_PASSWORD` for `electron-builder`. See [electron-builder code signing](https://www.electron.build/code-signing).
- **EV certificates** can enable immediate SmartScreen reputation in many cases; they cost more and often require a hardware token.

## Auto-updates

- Add `electron-updater` in the app and publish release metadata compatible with electron-builder (GitHub Releases is supported when `publish` is configured).
- Release workflow should produce update metadata (e.g. `latest.yml` for generic provider) alongside installers; `electron-builder` can generate this when publishing is enabled.
- Plan a **staged rollout** (optional): publish drafts, test on a second machine, then mark the release latest.

## Operational checklist

1. Ship a few manual installs and confirm install path, shortcuts, and first-run behavior.
2. Enable signing in CI when you have a cert and secrets storage.
3. Wire `electron-updater` only after you are comfortable with release cadence and rollback (keep previous installer attached to the prior GitHub Release).
