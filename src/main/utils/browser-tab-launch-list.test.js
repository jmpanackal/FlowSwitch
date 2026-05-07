'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBrowserTabLaunchList } = require('./browser-tab-launch-list');

const normalizeSafeUrl = (raw) => {
  const s = String(raw || '').trim();
  return s.startsWith('https://') ? s : '';
};

test('by_url_and_app collapses duplicate profile tabs', () => {
  const profile = {
    browserTabLaunchDedupe: 'by_url_and_app',
    browserTabs: [
      { url: 'https://example.com/a', browser: 'Edge', appInstanceId: 'i1' },
      { url: 'https://example.com/a', browser: 'Edge', appInstanceId: 'i1' },
    ],
  };
  const list = buildBrowserTabLaunchList(profile, { browserUrls: [] }, normalizeSafeUrl);
  assert.equal(list.length, 1);
});

test('each_saved_row keeps duplicate URLs as separate entries', () => {
  const profile = {
    browserTabLaunchDedupe: 'each_saved_row',
    browserTabs: [
      { id: 't1', url: 'https://example.com/a', browser: 'Edge', appInstanceId: 'i1' },
      { id: 't2', url: 'https://example.com/a', browser: 'Edge', appInstanceId: 'i1' },
    ],
  };
  const list = buildBrowserTabLaunchList(profile, { browserUrls: [] }, normalizeSafeUrl);
  assert.equal(list.length, 2);
});

test('legacy browserUrls respect each_saved_row', () => {
  const profile = {
    browserTabLaunchDedupe: 'each_saved_row',
    browserTabs: [],
  };
  const list = buildBrowserTabLaunchList(
    profile,
    { browserUrls: ['https://x.test/', 'https://x.test/'] },
    normalizeSafeUrl,
  );
  assert.equal(list.length, 2);
});
