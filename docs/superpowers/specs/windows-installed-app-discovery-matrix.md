# Windows installed-app discovery matrix

This document maps **where user-launchable Windows applications can appear** and how FlowSwitch’s catalog scan covers each surface. Use it when extending discovery so gaps (for example Store shims or nested per-user installs) are intentional, not accidental.

## Legend

| Code | Meaning |
| --- | --- |
| **Yes** | Implemented in `collectInstalledAppsCatalog` (`src/main/ipc/trusted-renderer-ipc.js`) |
| **Reg** | `getRegistryInstalledApps` (`src/main/registryApps.js`) |
| **Opt** | Behind `FLOWSWITCH_ENABLE_EXE_SCAN=1` |

## Primary surfaces

| # | Surface | Typical path / hive | Examples | Covered |
| --- | --- | --- | --- | --- |
| 1 | All-users Start Menu | `%ProgramData%\Microsoft\Windows\Start Menu\Programs\**` | Corporate deployed shortcuts | Yes (.lnk / .url) |
| 2 | Per-user Start Menu | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\**` | User-installed shortcuts | Yes |
| 3 | Per-user Start Menu (local) | `%LOCALAPPDATA%\Microsoft\Windows\Start Menu\Programs\**` | Duplicate layout | Yes |
| 4 | Taskbar pins | `%APPDATA%\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\**` | Pinned-only apps | Yes |
| 5 | Implicit App Shortcuts | `...\User Pinned\ImplicitAppShortcuts\**` | Some packaged / promoted tiles | Yes |
| 6 | Uninstall registry (64-bit machine) | `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall` | Most x64 machine-wide | Reg + Yes |
| 7 | Uninstall registry (32-bit on 64-bit) | `HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall` | 32-bit machine-wide | Reg + Yes |
| 8 | Uninstall registry (per-user) | `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall` | Per-user installers (desktop Spotify often here) | Reg + Yes |
| 9 | Uninstall registry (per-user WOW64) | `HKCU\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall` | 32-bit per-user | Reg + Yes |
| 10 | MSIX / Store **user shims** | `%LOCALAPPDATA%\Microsoft\WindowsApps\*.exe` | Store Spotify, Terminal, many UWP bridges | Yes (**full** `*.exe` scan; symlink-aware). **Filtered noise:** `winget`, `wt`, `WindowsPackageManager*`, `XboxPcAppAdmin*`, `XboxPcAppCE*`, common `python*` shims (see `isWindowsAppsCatalogNoiseBasename` in `icon-path-and-app-helpers.js`). Icons: `getSafeIconDataUrl` resolves **`realpath`** before Shell / `getFileIcon` so Store aliases are not stuck on the generic placeholder. |
| 11 | MSIX package volume | `%ProgramFiles%\WindowsApps\...` (ACL-heavy) | Store Spotify package root, other MSIX payloads | **Yes (indirect)** — Node cannot `stat`/`readdir` most of this tree as a normal user. When ARP `InstallLocation` points here, we **do not** rely on folder probe; we map the package folder name to `%LOCALAPPDATA%\Microsoft\WindowsApps\<Family>_<PublisherHash>.exe` via `inferMsixUserWindowsAppsShimFromPackageDir` (prefix scan fallback if the exact filename differs). |
| 11b | MSIX per-user package root | `%LOCALAPPDATA%\Packages\<PFN>\...` | Store apps often register here instead of `Program Files\WindowsApps` | **Yes** — same helper tries `%LOCALAPPDATA%\Microsoft\WindowsApps\<PFN>.exe`. |
| 12 | Optional deep `.exe` scan | `Program Files`, `Program Files (x86)` | Recovery / IT | Opt |

## Registry value notes (Uninstall keys)

| Value | Role in discovery |
| --- | --- |
| `DisplayName` | Required for our registry rows (name). |
| `DisplayIcon` / `QuietInstallDisplayIcon` | Icon / path hints. |
| `InstallLocation` | Folder probe + path gates; often **no** `.exe` in the string. Under `...\Program Files\WindowsApps\...`, probe is skipped in favor of **MSIX shim inference** (see row 11). |
| `UninstallString` | Executable extraction + haystack for “real” install path. |
| `QuietUninstallString` | Fallback when `UninstallString` is empty; still a path signal. |
| `SystemComponent` / `ParentKeyName` / `ReleaseType` | Noise filters in `isLikelyUserApp`. |

## Intentionally out of scope (today)

| Surface | Why not scanned end-to-end |
| --- | --- |
| `HKU\<SID>\...` (other users) | Electron runs as current user; cross-user installs are uncommon for this product. |
| `App Paths` (`HKLM\...\App Paths`) | Very broad; duplicates Start Menu for most GUI apps. |
| `AppxPackage` / `Get-AppxPackage` PowerShell | Requires shelling out or native bindings; Start Menu + WindowsApps shims cover most UX. |
| Portable / zip apps | No registry or Start Menu entry by design. |
| `%LOCALAPPDATA%\Programs` tree | Partially covered via Uninstall + optional exe scan; not fully walked by default (cost). |

## Change checklist

When adding a new discovery source:

1. Add the row to this matrix.
2. Wire it in `collectInstalledAppsCatalog` with a **stable `source` string** and `sourcePriority`.
3. Ensure `isLikelyUserApp` (and any path gate) allows legitimate apps without opening obvious junk paths.
4. Add a focused unit or integration test if logic is non-trivial (path parsing, probing, MSI strings).
