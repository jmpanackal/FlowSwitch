// Utility to read installed apps from Windows Registry
const WinReg = require('winreg');

function getRegistryInstalledApps() {
  return new Promise((resolve) => {
    const uninstallKeys = [
      { hive: WinReg.HKLM, key: '\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },
      { hive: WinReg.HKLM, key: '\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },
      { hive: WinReg.HKCU, key: '\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },
      // 32-bit per-user installers register here on 64-bit Windows (often missed if only HKCU Uninstall is read).
      { hive: WinReg.HKCU, key: '\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },
    ];
    const results = [];
    let pending = uninstallKeys.length;
    for (const { hive, key } of uninstallKeys) {
      const regKey = new WinReg({ hive, key });
      regKey.keys((err, subkeys) => {
        if (err || !subkeys) {
          if (--pending === 0) resolve(results);
          return;
        }
        let subPending = subkeys.length;
        if (subPending === 0 && --pending === 0) resolve(results);
        for (const sub of subkeys) {
          sub.values((err, items) => {
            if (!err && items) {
              const displayName = items.find(i => i.name === 'DisplayName');
              const displayIcon = items.find(i => i.name === 'DisplayIcon');
              const quietInstallIcon = items.find(i => i.name === 'QuietInstallDisplayIcon');
              const installLocation = items.find(i => i.name === 'InstallLocation');
              const systemComponent = items.find(i => i.name === 'SystemComponent');
              const releaseType = items.find(i => i.name === 'ReleaseType');
              const parentKeyName = items.find(i => i.name === 'ParentKeyName');
              const uninstallString = items.find(i => i.name === 'UninstallString');
              const quietUninstallString = items.find(i => i.name === 'QuietUninstallString');
              const iconFromRegistry = displayIcon?.value?.split?.(',')?.[0]?.trim()
                || quietInstallIcon?.value?.split?.(',')?.[0]?.trim()
                || '';
              const installLoc = String(installLocation?.value || '').trim();
              const uninst = String(uninstallString?.value || '').trim();
              const quietUninst = String(quietUninstallString?.value || '').trim();
              const hasUninstallSignals = !!(iconFromRegistry || installLoc || uninst || quietUninst);
              const nmLc = String(displayName?.value || '').trim().toLowerCase();
              const codexLikeName = nmLc.includes('openai') && nmLc.includes('codex');
              if (displayName && (hasUninstallSignals || codexLikeName)) {
                results.push({
                  name: displayName.value,
                  iconSource: iconFromRegistry,
                  installLocation: installLoc,
                  systemComponent: String(systemComponent?.value || '').trim() === '1',
                  releaseType: String(releaseType?.value || '').trim(),
                  parentKeyName: String(parentKeyName?.value || '').trim(),
                  uninstallString: uninst,
                  quietUninstallString: quietUninst,
                });
              }
            }
            if (--subPending === 0 && --pending === 0) resolve(results);
          });
        }
      });
    }
  });
}

module.exports = { getRegistryInstalledApps };
