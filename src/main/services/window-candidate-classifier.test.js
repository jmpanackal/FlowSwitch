const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isChromiumFamilyProcessKey,
  isLikelyAuxiliaryWindowClass,
  scoreWindowCandidate,
} = require('./window-candidate-classifier');

test('isChromiumFamilyProcessKey recognizes chrome family keys', () => {
  assert.equal(isChromiumFamilyProcessKey('chrome'), true);
  assert.equal(isChromiumFamilyProcessKey('MSedge.EXE'), true);
  assert.equal(isChromiumFamilyProcessKey('notepad'), false);
});

test('isLikelyAuxiliaryWindowClass detects tray and tooltip classes', () => {
  assert.equal(isLikelyAuxiliaryWindowClass('TrayIconMessageWindow'), true);
  assert.equal(isLikelyAuxiliaryWindowClass('Chrome_WidgetWin_1'), false);
});

test('scoreWindowCandidate ranks enabled larger window above disabled', () => {
  const enabled = {
    handle: '1',
    enabled: true,
    isMinimized: false,
    hung: false,
    tool: false,
    cloaked: false,
    titleLength: 4,
    className: 'notepad',
    area: 100_000,
    width: 400,
    height: 300,
  };
  const disabled = { ...enabled, enabled: false, handle: '2' };
  const a = scoreWindowCandidate(disabled, { chromiumProcessHint: 'notepad' });
  const b = scoreWindowCandidate(enabled, { chromiumProcessHint: 'notepad' });
  assert.ok(b > a);
});
