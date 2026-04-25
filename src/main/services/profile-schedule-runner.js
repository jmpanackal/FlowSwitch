'use strict';

const { dialog } = require('electron');

const parseTimeHHMM = (raw) => {
  const s = typeof raw === 'string' ? raw.trim() : '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return { hh, mm };
};

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const computeNextScheduleAt = (profile) => {
  if (!profile || profile.scheduleEnabled !== true) return null;
  const schedule = profile.scheduleData || profile.schedule || null;
  if (!schedule || typeof schedule !== 'object') return null;

  const type = String(schedule.type || '').toLowerCase();
  const now = new Date();

  const nextFromDaily = (timeStr) => {
    const t = parseTimeHHMM(timeStr);
    if (!t) return null;
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setHours(t.hh, t.mm, 0, 0);
    if (next.getTime() <= now.getTime() + 500) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  };

  if (type === 'daily') {
    return nextFromDaily(schedule.dailyTime);
  }

  if (type === 'weekly') {
    const ws = schedule.weeklySchedule && typeof schedule.weeklySchedule === 'object'
      ? schedule.weeklySchedule
      : {};
    let best = null;
    for (let offset = 0; offset < 8; offset += 1) {
      const candidate = new Date(now);
      candidate.setSeconds(0, 0);
      candidate.setDate(candidate.getDate() + offset);
      const dayKey = DAY_KEYS[candidate.getDay()];
      const day = ws[dayKey];
      if (!day || day.enabled !== true) continue;
      const t = parseTimeHHMM(day.time);
      if (!t) continue;
      candidate.setHours(t.hh, t.mm, 0, 0);
      if (candidate.getTime() <= now.getTime() + 500) continue;
      best = candidate;
      break;
    }
    return best;
  }

  // Legacy fallback: autoSwitchTime = daily HH:MM
  if (profile.autoSwitchTime) {
    return nextFromDaily(profile.autoSwitchTime);
  }

  return null;
};

/**
 * @param {{
 *  readProfilesFromDisk: () => unknown,
 *  unpackProfilesReadResult: (disk: unknown) => { profiles: unknown[] },
 *  launchProfileById: (profileId: string, opts?: object) => Promise<unknown>,
 *  getMainWindow?: () => import('electron').BrowserWindow | null,
 * }} deps
 */
const createProfileScheduleRunner = (deps) => {
  const {
    readProfilesFromDisk,
    unpackProfilesReadResult,
    launchProfileById,
    getMainWindow,
  } = deps;

  /** @type {Map<string, NodeJS.Timeout>} */
  const timersByProfileId = new Map();

  const clearAll = () => {
    for (const t of timersByProfileId.values()) {
      try { clearTimeout(t); } catch { /* ignore */ }
    }
    timersByProfileId.clear();
  };

  const scheduleOne = (profile) => {
    const profileId = String(profile?.id || '').trim();
    if (!profileId) return;
    const nextAt = computeNextScheduleAt(profile);
    if (!nextAt) return;

    const ms = Math.max(250, nextAt.getTime() - Date.now());
    const t = setTimeout(async () => {
      timersByProfileId.delete(profileId);
      try {
        const name = String(profile?.name || 'Profile').trim() || 'Profile';
        const mainWindow = typeof getMainWindow === 'function' ? getMainWindow() : null;
        const result = await dialog.showMessageBox(
          mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
          {
            type: 'info',
            buttons: ['Launch now', 'Skip'],
            defaultId: 0,
            cancelId: 1,
            title: 'Scheduled profile launch',
            message: `Launch “${name}” now?`,
            detail: 'This launch was triggered by your schedule.',
            noLink: true,
          },
        );
        if (result?.response === 0) {
          await launchProfileById(profileId, {
            fireAndForget: true,
            launchOrigin: 'schedule',
          });
        }
      } catch (err) {
        // Swallow scheduler errors; we'll resync on next profile save.
        console.warn('[schedule] scheduled launch prompt failed:', String(err?.message || err));
      } finally {
        // Always reschedule from latest disk state (profile could have changed).
        try {
          refreshFromDisk();
        } catch {
          // ignore
        }
      }
    }, ms);

    timersByProfileId.set(profileId, t);
  };

  const refreshFromDisk = () => {
    clearAll();
    const disk = readProfilesFromDisk();
    const { profiles } = unpackProfilesReadResult(disk);
    const list = Array.isArray(profiles) ? profiles : [];
    for (const p of list) scheduleOne(p);
  };

  return { refreshFromDisk, clearAll };
};

module.exports = { createProfileScheduleRunner };

