# FlowSwitch marketing site

Static files in this folder power the public download and positioning page. Deploy the **`website/` directory** as the site root (not the monorepo root).

The logo file `flowswitch-logo.png` is duplicated here from `public/` so the marketing site can deploy without pulling the whole app tree; refresh the copy if the brand asset changes.

## Before you deploy

1. Point `website/latest.json` at your GitHub repo (`githubRepository` as `owner/repo`). From the repo root, regenerate the file after version bumps:

   ```bash
   set FLOWSWITCH_GITHUB_REPO=your-org/flowswitch
   npm run website:sync-latest
   ```

   On macOS or Linux:

   ```bash
   FLOWSWITCH_GITHUB_REPO=your-org/flowswitch npm run website:sync-latest
   ```

   If you omit the variable, the sync script defaults to `jmpanackal/FlowSwitch` (change the default in `scripts/sync-website-latest-json.mjs` if your fork is canonical).

2. **Publish a release (CI):** push an annotated tag whose `v` version matches root `package.json` `version` (for example `0.1.0` → tag `v0.1.0`). The workflow `.github/workflows/release.yml` builds on `windows-latest`, runs lint/typecheck/tests, runs `npm run dist:win`, and uploads the NSIS installer and portable `.exe` to that GitHub Release. Example:

   ```bash
   git tag -a v0.1.0 -m "FlowSwitch 0.1.0"
   git push origin v0.1.0
   ```

   Wait for the **Release** workflow to finish, then confirm the release assets match the filenames in `website/latest.json` under `files` (for example `FlowSwitch-0.1.0-win-x64-installer.exe` and `FlowSwitch-0.1.0-win-x64-portable.exe`).

If download links open GitHub’s **Not Found** page, the tag exists but the workflow did not attach the `.exe` files (failed job, wrong glob, or Actions disabled). Open **Actions → Release** for that tag and fix the failing step; the marketing page also shows a hint if `latest.json` fails to load.

3. Replace placeholder support text on `privacy.html` before broad marketing.

## Build the Windows installer (local)

From the repo root on Windows:

```bash
npm run dist:win
```

Outputs NSIS installer and portable `.exe` under `release/` (see `package.json` `build` for exact `artifactName` patterns).

### Option A — GitHub Releases (production)

Prefer **tag push + CI** (see step 2 under *Before you deploy*). For a one-off manual upload: run `npm run dist:win`, create a GitHub Release with tag `v` + `package.json` version, attach the two `FlowSwitch-*-win-x64-*.exe` files from `release/` with the exact names expected in `website/latest.json`, then run `npm run website:sync-latest` if you changed the repo or version.

### Option B — Host binaries next to the static site

Use this when you are not using GitHub download URLs yet (for example local `npx serve` or a host that serves `website/` as-is).

1. Run `npm run dist:win`.
2. Run `npm run website:stage-downloads` (copies the two `.exe` files into `website/downloads/`).
3. Regenerate `latest.json` with a relative download base (PowerShell):

   ```powershell
   $env:FLOWSWITCH_DOWNLOAD_BASE_URL="./downloads/"
   npm run website:sync-latest
   ```

   On macOS or Linux:

   ```bash
   FLOWSWITCH_DOWNLOAD_BASE_URL=./downloads/ npm run website:sync-latest
   ```

The marketing page resolves installer and portable links from `downloadBaseUrl` + the filenames in `files`. The `website/downloads/*.exe` paths are gitignored so installers are not committed by mistake; deploy or copy them with your site when you use this option.

## Cloudflare Pages

- Create a Pages project from this Git repository.
- **Build command:** leave empty (or `exit 0`).
- **Build output directory:** `website`.
- Attach your custom domain under **Custom domains** and add the DNS records Cloudflare shows.

Optional: `_headers` in this folder sets baseline security headers on Pages.

## Netlify

- New site from Git → set **Base directory** to `website`.
- **Build command:** leave empty.
- **Publish directory:** `.` (relative to base directory).

`netlify.toml` in this folder documents the same for CLI deploys.

## Vercel

- Import the repo, set **Root Directory** to `website`.
- Framework preset: **Other**, no build command, output `.`.

## DNS (any host)

Point your apex or `www` record to the provider’s target (CNAME for `www`, or A/ALIAS for apex per provider docs).
