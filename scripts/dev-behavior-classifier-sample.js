#!/usr/bin/env node
/**
 * Standalone sample for legacy app-behavior classification (not wired to Electron main).
 * Run: node scripts/dev-behavior-classifier-sample.js
 */

const APP_BEHAVIOR_PROFILES = {
  qt_based: {
    keys: ['anki', 'qt'],
    characteristics: {
      delayed_window_creation: true,
      handle_instability: true,
      monitor_resistance: true,
      splash_to_main_transition: true,
      requires_extended_stabilization: true,
    },
  },
  standard: {
    keys: ['audacity', 'notepad', 'calculator'],
    characteristics: {
      delayed_window_creation: false,
      handle_instability: false,
      monitor_resistance: false,
      splash_to_main_transition: false,
      requires_extended_stabilization: false,
    },
  },
};

const getAppBehaviorProfile = (processKey) => {
  const normalizedKey = String(processKey || '').toLowerCase().replace(/\.exe$/i, '');

  for (const [profileName, profile] of Object.entries(APP_BEHAVIOR_PROFILES)) {
    if (profile.keys.some((key) => normalizedKey.includes(key))) {
      return { name: profileName, ...profile.characteristics };
    }
  }

  return {
    name: 'standard',
    delayed_window_creation: false,
    handle_instability: false,
    monitor_resistance: false,
    splash_to_main_transition: false,
    requires_extended_stabilization: false,
  };
};

console.log('Testing app behavior classification:');
console.log('Anki:', getAppBehaviorProfile('anki'));
console.log('Audacity:', getAppBehaviorProfile('audacity'));
console.log('Chrome:', getAppBehaviorProfile('chrome'));
console.log('Unknown app:', getAppBehaviorProfile('unknownapp'));

const ankiProfile = getAppBehaviorProfile('anki');
console.log('\nAnki (Qt-based) characteristics:');
console.log('- Delayed window creation:', ankiProfile.delayed_window_creation);
console.log('- Handle instability:', ankiProfile.handle_instability);
console.log('- Monitor resistance:', ankiProfile.monitor_resistance);
console.log('- Requires extended stabilization:', ankiProfile.requires_extended_stabilization);
console.log('- Splash to main transition:', ankiProfile.splash_to_main_transition);

const audacityProfile = getAppBehaviorProfile('audacity');
console.log('\nAudacity (standard) characteristics:');
console.log('- Delayed window creation:', audacityProfile.delayed_window_creation);
console.log('- Handle instability:', audacityProfile.handle_instability);
console.log('- Monitor resistance:', audacityProfile.monitor_resistance);
console.log('- Requires extended stabilization:', audacityProfile.requires_extended_stabilization);

function calculateAdaptiveTiming(appBehavior, isChromiumFamily = false, isDuplicateLaunch = false) {
  let initialDelay = 200;
  let stabilizationDuration = isChromiumFamily ? 1600 : 5200;

  if (appBehavior.delayed_window_creation) {
    initialDelay = 400;
    stabilizationDuration = 12000;
  } else if (appBehavior.handle_instability) {
    stabilizationDuration = 8000;
  }

  if (isDuplicateLaunch) {
    initialDelay = Math.max(initialDelay, 240);
  }

  return { initialDelay, stabilizationDuration };
}

console.log('\nAdaptive timing calculations:');
console.log('Anki:', calculateAdaptiveTiming(ankiProfile, false, false));
console.log('Audacity:', calculateAdaptiveTiming(audacityProfile, false, false));
console.log('Chrome (duplicate):', calculateAdaptiveTiming(getAppBehaviorProfile('chrome'), true, true));
