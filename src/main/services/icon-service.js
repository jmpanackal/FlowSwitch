const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const iconExtractor = require('icon-extractor');

const inFlightExtractions = new Map();

function writeBase64IconToFile(base64, filePath) {
  const buffer = Buffer.from(base64, 'base64');
  fs.writeFileSync(filePath, buffer);
}

function getAppIconDir() {
  const dir = path.join(app.getPath('userData'), 'app-icons');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extractIconToIco(exePath, icoPath, timeoutMs = 1500) {
  if (fs.existsSync(icoPath)) return Promise.resolve(icoPath);
  if (inFlightExtractions.has(icoPath)) return inFlightExtractions.get(icoPath);

  const extractionPromise = new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Icon extraction timeout for ${icoPath}`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      iconExtractor.emitter.removeListener('icon', handler);
      iconExtractor.emitter.removeListener('error', errorHandler);
    };

    const normalizePathForCompare = (value) => (
      String(value || '')
        .replace(/\\/g, '/')
        .toLowerCase()
        .trim()
    );

    const handler = (data) => {
      if (!data || !data.Base64ImageData) return;
      const eventContext = normalizePathForCompare(data.Context);
      const expectedContext = normalizePathForCompare(exePath);
      if (!eventContext || eventContext !== expectedContext) return;
      if (settled) return;
      settled = true;
      try {
        writeBase64IconToFile(data.Base64ImageData, icoPath);
      } catch (err) {
        cleanup();
        reject(err);
        return;
      }
      cleanup();
      resolve(icoPath);
    };

    const errorHandler = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    iconExtractor.emitter.on('icon', handler);
    iconExtractor.emitter.on('error', errorHandler);
    iconExtractor.getIcon(exePath, icoPath);
  }).finally(() => {
    inFlightExtractions.delete(icoPath);
  });

  inFlightExtractions.set(icoPath, extractionPromise);
  return extractionPromise;
}

module.exports = {
  writeBase64IconToFile,
  getAppIconDir,
  extractIconToIco,
};
