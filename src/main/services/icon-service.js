const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const iconExtractor = require('icon-extractor');

function writeBase64IconToFile(base64, filePath) {
  const buffer = Buffer.from(base64, 'base64');
  fs.writeFileSync(filePath, buffer);
}

function getAppIconDir() {
  const dir = path.join(app.getPath('userData'), 'app-icons');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extractIconToIco(exePath, icoPath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(icoPath)) return resolve(icoPath);
    const cleanup = () => {
      iconExtractor.emitter.removeListener('icon', handler);
      iconExtractor.emitter.removeListener('error', errorHandler);
    };
    const handler = (data) => {
      if (data && data.Context === icoPath && data.Base64ImageData) {
        writeBase64IconToFile(data.Base64ImageData, icoPath);
        cleanup();
        resolve(icoPath);
      }
    };
    const errorHandler = (err) => {
      cleanup();
      reject(err);
    };
    iconExtractor.emitter.on('icon', handler);
    iconExtractor.emitter.on('error', errorHandler);
    iconExtractor.getIcon(exePath, icoPath);
  });
}

module.exports = {
  writeBase64IconToFile,
  getAppIconDir,
  extractIconToIco,
};
