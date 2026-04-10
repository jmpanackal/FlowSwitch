const { MAX_URL_LENGTH } = require('./limits');

const safeLimitedString = (value, maxLength) => {
  const str = String(value || '').trim();
  if (!str) return '';
  return str.slice(0, Math.max(1, Number(maxLength || 1)));
};

const isSafeExternalHttpUrl = (value) => {
  const candidate = safeLimitedString(value, MAX_URL_LENGTH);
  if (!candidate) return false;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const normalizeSafeUrl = (value) => (
  isSafeExternalHttpUrl(value) ? safeLimitedString(value, MAX_URL_LENGTH) : ''
);

module.exports = {
  safeLimitedString,
  isSafeExternalHttpUrl,
  normalizeSafeUrl,
};
