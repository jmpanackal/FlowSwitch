'use strict';

const path = require('path');
const { app, globalShortcut, Menu } = require('electron');
const { readRecentProfileLaunchIds, recordRecentProfileLaunchId } = require('./recent-profile-launch-ids');

const PROFILE_ARG_PREFIX = '--flowswitch-profile=';

let cachedProductDisplayName = '';

const getProductDisplayName = () => {
  if (cachedProductDisplayName) return cachedProductDisplayName;
  try {
    const pkg = require(path.join(__dirname, '../../..', 'package.json'));
    cachedProductDisplayName = (
      // Prefer a stable, user-facing name. `pkg.name` is often lowercase (e.g. "flowswitch").
      String(pkg.productName || 'FlowSwitch').trim() || 'FlowSwitch'
    );
  } catch {
    cachedProductDisplayName = 'FlowSwitch';
  }
  return cachedProductDisplayName;
};

/**
 * Windows User Tasks must launch the same entry point as dev vs packaged:
 * - Packaged: `FlowSwitch.exe --flowswitch-profile=…`
 * - Dev: `electron.exe "path/to/app" --flowswitch-profile=…` so Electron loads this app.
 */
const buildWindowsJumpListArguments = (encodedProfileId) => {
  const flag = `${PROFILE_ARG_PREFIX}${encodedProfileId}`;
  if (app.isPackaged) return flag;
  const entry = app.getAppPath();
  if (!entry) return flag;
  return entry.includes(' ') ? `"${entry}" ${flag}` : `${entry} ${flag}`;
};

/** Args to start the app without a profile jump (replaces Chromium’s default “Electron” task in dev). */
const buildWindowsOpenAppJumpListArgs = () => {
  if (app.isPackaged) return '';
  const entry = app.getAppPath();
  if (!entry) return '';
  return entry.includes(' ') ? `"${entry}"` : entry;
};

/**
 * Map user-facing modifiers to Electron accelerator tokens.
 * @param {string} raw
 * @returns {string | null}
 */
const toElectronAccelerator = (raw) => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  let s = trimmed.replace(/\s+/g, '');
  s = s.replace(/Control\+/gi, 'CommandOrControl+');
  s = s.replace(/Ctrl\+/gi, 'CommandOrControl+');
  s = s.replace(/Cmd\+/gi, 'CommandOrControl+');
  s = s.replace(/Command\+/gi, 'CommandOrControl+');
  s = s.replace(/Win\+/gi, 'Super+');
  s = s.replace(/Windows\+/gi, 'Super+');
  s = s.replace(/Meta\+/gi, 'Super+');
  return s;
};

const decodeProfileIdTail = (encoded) => {
  const raw = String(encoded || '').trim().replace(/^["']|["']$/g, '');
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const parseProfileLaunchIdFromArgv = (commandLineOrArgv) => {
  if (Array.isArray(commandLineOrArgv)) {
    const hit = commandLineOrArgv.find((a) => typeof a === 'string' && a.startsWith(PROFILE_ARG_PREFIX));
    if (!hit) return null;
    return decodeProfileIdTail(hit.slice(PROFILE_ARG_PREFIX.length));
  }
  if (typeof commandLineOrArgv === 'string') {
    const idx = commandLineOrArgv.indexOf(PROFILE_ARG_PREFIX);
    if (idx < 0) return null;
    let tail = commandLineOrArgv.slice(idx + PROFILE_ARG_PREFIX.length).trim();
    if (tail.startsWith('"')) {
      const end = tail.indexOf('"', 1);
      tail = end > 0 ? tail.slice(1, end) : tail.replace(/"/g, '');
    } else {
      tail = tail.split(/\s+/)[0];
    }
    return decodeProfileIdTail(tail);
  }
  return null;
};

/**
 * @param {{
 *   unpackProfilesReadResult: (disk: unknown) => { profiles: unknown[] },
 *   readProfilesFromDisk: () => unknown,
 *   launchProfileById: (profileId: string, opts?: object) => Promise<unknown>,
 *   getJumpListIconPath?: () => string | null,
 * }} deps
 */
const createProfileAccessShell = (deps) => {
  const {
    unpackProfilesReadResult,
    readProfilesFromDisk,
    launchProfileById,
    getJumpListIconPath,
  } = deps;

  const refreshProfileHotkeys = () => {
    globalShortcut.unregisterAll();
    const disk = readProfilesFromDisk();
    const { profiles } = unpackProfilesReadResult(disk);
    if (!Array.isArray(profiles)) return;
    for (const p of profiles) {
      const profileId = String(p?.id || '').trim();
      const acc = toElectronAccelerator(p?.hotkey);
      if (!profileId || !acc) continue;
      try {
        const ok = globalShortcut.register(acc, () => {
          void launchProfileById(profileId, {
            fireAndForget: true,
            launchOrigin: 'global-shortcut',
          });
        });
        if (!ok) {
          console.warn('[profile-hotkey] Accelerator could not be registered:', acc);
        }
      } catch (err) {
        console.warn('[profile-hotkey] Invalid accelerator:', acc, String(err?.message || err));
      }
    }
  };

  const buildRecentMenuDescriptors = () => {
    const recentIds = readRecentProfileLaunchIds();
    const disk = readProfilesFromDisk();
    const { profiles } = unpackProfilesReadResult(disk);
    const list = Array.isArray(profiles) ? profiles : [];
    const byId = new Map(list.map((row) => [String(row?.id || '').trim(), row]));
    return recentIds
      .map((id) => {
        const row = byId.get(id);
        if (!row) return null;
        const name = String(row?.name || 'Profile').trim() || 'Profile';
        return { id, name };
      })
      .filter(Boolean);
  };

  const refreshTaskbarJumpListOrDock = () => {
    const items = buildRecentMenuDescriptors();
    if (process.platform === 'win32') {
      const jumpIcon = typeof getJumpListIconPath === 'function' ? getJumpListIconPath() : null;
      const attachIcon = (row) => {
        if (jumpIcon) {
          row.iconPath = jumpIcon;
          row.iconIndex = 0;
        }
      };

      const openRow = {
        type: 'task',
        program: process.execPath,
        args: buildWindowsOpenAppJumpListArgs(),
        title: getProductDisplayName(),
        description: 'Open FlowSwitch',
      };
      attachIcon(openRow);

      const profileJumpItems = items.map(({ id, name }) => {
        const encodedId = encodeURIComponent(id);
        const row = {
          type: 'task',
          program: process.execPath,
          args: buildWindowsJumpListArguments(encodedId),
          title: `Launch “${name}”`,
          description: 'Launch this FlowSwitch workspace profile',
        };
        attachIcon(row);
        return row;
      });

      // First row replaces Chromium’s default electron.exe task (shows as “Electron” in dev).
      const jumpItems = [openRow, ...profileJumpItems];

      try {
        // Windows Tasks: remove Electron defaults in dev.
        try { app.setUserTasks([]); } catch { /* ignore */ }
        app.setUserTasks(jumpItems.map((item) => {
          const row = { ...item };
          delete row.type;
          return row;
        }));
        // Clear and re-apply jump list to avoid stale default entries.
        try { app.setJumpList([]); } catch { /* ignore */ }
        const result = app.setJumpList([{ type: 'tasks', items: jumpItems }]);
        if (result !== 'ok') {
          console.warn('[jump-list] setJumpList returned:', result);
        }
      } catch (err) {
        console.warn('[jump-list] setJumpList failed:', String(err?.message || err));
      }
      return;
    }
    if (process.platform === 'darwin') {
      const template = items.map(({ id, name }) => ({
        label: name,
        click: () => {
          void launchProfileById(id, {
            fireAndForget: true,
            launchOrigin: 'dock-menu',
          });
        },
      }));
      app.dock.setMenu(Menu.buildFromTemplate(template.length ? template : [{ label: 'No recent profiles', enabled: false }]));
    }
  };

  const refreshFromDisk = () => {
    refreshProfileHotkeys();
    refreshTaskbarJumpListOrDock();
  };

  const onProfileLaunchStarted = (profileId) => {
    recordRecentProfileLaunchId(profileId);
    refreshTaskbarJumpListOrDock();
  };

  app.on('will-quit', () => {
    try {
      globalShortcut.unregisterAll();
    } catch {
      // ignore
    }
  });

  return {
    refreshFromDisk,
    onProfileLaunchStarted,
    parseProfileLaunchIdFromArgv,
  };
};

module.exports = {
  createProfileAccessShell,
  parseProfileLaunchIdFromArgv,
  toElectronAccelerator,
  PROFILE_ARG_PREFIX,
};
