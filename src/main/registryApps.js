// Utility to read installed apps from Windows Registry
const WinReg = require('winreg');

function getRegistryInstalledApps() {
  return new Promise((resolve) => {
    const uninstallKeys = [
      { hive: WinReg.HKLM, key: '\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },
      { hive: WinReg.HKLM, key: '\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },
      { hive: WinReg.HKCU, key: '\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },
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
              if (displayName && displayIcon) {
                results.push({
                  name: displayName.value,
                  iconSource: displayIcon.value.split(',')[0]
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
