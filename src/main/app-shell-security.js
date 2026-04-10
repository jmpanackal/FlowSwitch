const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');

const DEV_SERVER_URL = 'http://localhost:5173';

/**
 * Session CSP injection, packaged dist URL trust, and trusted IPC registration.
 * @param {{ app: import('electron').App; session: import('electron').Session; ipcMain: import('electron').IpcMain }} electronApis
 */
const createAppShellSecurity = ({ app, session, ipcMain }) => {
  const getDistIndexPath = () => path.join(__dirname, '../../dist/index.html');

  const getAppEntryUrl = () => (
    app.isPackaged
      ? pathToFileURL(getDistIndexPath()).href
      : DEV_SERVER_URL
  );

  const getContentSecurityPolicy = () => {
    if (!app.isPackaged) {
      return [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "frame-src 'none'",
        "object-src 'none'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "connect-src 'self' http://localhost:5173 http://127.0.0.1:5173 ws://localhost:5173 ws://127.0.0.1:5173",
        "media-src 'self' data: blob:",
        "worker-src 'self' blob:",
      ].join('; ');
    }
    return [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "media-src 'self' data: blob:",
      "worker-src 'self' blob:",
    ].join('; ');
  };

  const shouldInjectAppCsp = (requestUrl) => {
    if (!requestUrl) return false;
    try {
      if (!app.isPackaged) {
        const u = new URL(requestUrl);
        return (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.port === '5173';
      }
      const distHref = pathToFileURL(getDistIndexPath()).href;
      const base = distHref.split('#')[0].split('?')[0];
      const reqBase = String(requestUrl).split('#')[0].split('?')[0];
      return reqBase === base || reqBase.startsWith(`${base}/`);
    } catch {
      return false;
    }
  };

  const setupSessionSecurity = () => {
    const defaultSession = session.defaultSession;

    defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      console.warn('[session] blocked permission request:', permission);
      callback(false);
    });

    defaultSession.setPermissionCheckHandler(() => false);

    defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (details.resourceType !== 'mainFrame' || !shouldInjectAppCsp(details.url)) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      const responseHeaders = { ...details.responseHeaders };
      const csp = getContentSecurityPolicy();
      responseHeaders['Content-Security-Policy'] = [csp];
      callback({ responseHeaders });
    });
  };

  const getDistDirPath = () => path.join(__dirname, '../../dist');

  const isTrustedPackagedFileUrl = (raw = '') => {
    if (!raw.startsWith('file://')) return false;
    try {
      const normalized = String(raw).split('#')[0].split('?')[0];
      const filePath = path.normalize(fileURLToPath(normalized));
      const distDir = path.normalize(getDistDirPath());
      const indexPath = path.normalize(getDistIndexPath());
      return filePath === indexPath || filePath.startsWith(`${distDir}${path.sep}`);
    } catch {
      return false;
    }
  };

  const isTrustedRendererUrl = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return false;
    if (app.isPackaged) return isTrustedPackagedFileUrl(raw);
    return raw.startsWith(`${DEV_SERVER_URL}/`) || raw === DEV_SERVER_URL;
  };

  const isTrustedIpcSender = (event) => (
    isTrustedRendererUrl(event?.senderFrame?.url || '')
  );

  const handleTrustedIpc = (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isTrustedIpcSender(event)) {
        const senderUrl = String(event?.senderFrame?.url || '');
        console.warn(`[ipc:${channel}] Blocked untrusted sender: ${senderUrl || '<empty>'}`);
        throw new Error('Untrusted renderer origin');
      }
      return handler(event, ...args);
    });
  };

  return {
    DEV_SERVER_URL,
    getAppEntryUrl,
    getDistIndexPath,
    getDistDirPath,
    setupSessionSecurity,
    isTrustedRendererUrl,
    handleTrustedIpc,
  };
};

module.exports = {
  createAppShellSecurity,
  DEV_SERVER_URL,
};
