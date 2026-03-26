// Utility to scan Program Files and Program Files (x86) for .exe files
const fs = require('fs');
const path = require('path');

function scanForExeFiles(dirs, maxDepth = 4) {
  const found = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
        found.push(fullPath);
      }
    }
  }
  for (const dir of dirs) {
    walk(dir, 0);
  }
  return found;
}

module.exports = { scanForExeFiles };
