import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || process.cwd());
const appPath = path.join(root, 'src/App.jsx');
const playerPath = path.join(root, 'src/components/TwitchPlayer.jsx');

let failed = false;

function requireMarkers(file, markers) {
  if (!fs.existsSync(file)) {
    console.error(`FAIL: missing ${path.relative(root, file)}`);
    failed = true;
    return '';
  }
  const text = fs.readFileSync(file, 'utf8');
  const missing = markers.filter((marker) => !text.includes(marker));
  if (missing.length) {
    console.error(`FAIL: ${path.relative(root, file)}`);
    for (const marker of missing) console.error(`  missing: ${marker}`);
    failed = true;
  } else {
    console.log(`PASS: ${path.relative(root, file)}`);
  }
  return text;
}

console.log('======================================================');
console.log(' SQUADVIEW DESKTOP AUDIO INDEPENDENCE VERIFICATION');
console.log('======================================================');
console.log();

const app = requireMarkers(appPath, [
  'Desktop/non-iOS Focus should only take ownership of the newly focused',
  'player?.play?.();',
  'window.__squadViewAudioDebug',
  'iosSingleAudioMode',
  'referralPromoTargetChannel',
  'listeningChannels.has(channel)',
]);

const player = requireMarkers(playerPath, [
  'audioSelected:',
  'audioEnabled:',
  'schedulerPaused:',
  'volume:',
  'window.__squadViewPlayerDebug',
  'preserveAudibleSession',
]);

if (app.includes('playersRef.current.forEach((player, playerChannel) => {\n      try {\n        const isFocusedPlayer = playerChannel === cleaned;')) {
  console.error('FAIL: Focus still rewrites every mounted desktop player.');
  failed = true;
} else {
  console.log('PASS: Focus no longer rewrites the entire desktop audio mix.');
}

if (!app.includes('setListeningChannels(new Set());\n      applyIOSAudioOwner(cleaned')) {
  console.error('FAIL: iOS single-audio-owner Focus path was not preserved.');
  failed = true;
} else {
  console.log('PASS: iOS single-audio-owner path preserved.');
}

if (!app.includes('className="referral-promo-tile"')) {
  console.error('FAIL: referral promo tile marker missing.');
  failed = true;
} else {
  console.log('PASS: referral promo feature preserved.');
}

console.log();
if (failed) {
  console.error('Verification failed. Do not deploy.');
  process.exit(1);
}
console.log('All desktop audio independence markers are installed.');
console.log('======================================================');
