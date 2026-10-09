import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');

const marker = '// On mobile the Twitch audio claim itself must be the first audio-changing';
const markerIndex = app.indexOf(marker);
const mobileEnd = markerIndex >= 0
  ? app.indexOf("\n    if (cleaned === activeChannel) {\n      const player =", markerIndex)
  : -1;
const mobileBlock = markerIndex >= 0 && mobileEnd > markerIndex
  ? app.slice(markerIndex, mobileEnd)
  : '';

const claimIndex = mobileBlock.indexOf('const claimed = claimMobileAudioFromGesture(');
const reconcileIndex = mobileBlock.indexOf('reconcileViewerAudio({', claimIndex + 1);

const checks = [
  ['mobile Listen still uses live Twitch audibility for Listen/Listening', app.includes("const currentOwner = actuallyAudible ? cleaned : '';")],
  ['mobile Listen performs the direct Twitch claim before controller reconciliation', claimIndex >= 0 && reconcileIndex > claimIndex],
  ['failed direct mobile claim returns to a clean silent retry state', mobileBlock.includes('if (!claimed)') && mobileBlock.includes('setAudioEnabled(false);') && mobileBlock.includes('const silentListening = new Set();')],
  ['successful mobile claim commits one-owner state only after the direct claim', mobileBlock.includes('setListeningChannels(nextListening);') && mobileBlock.indexOf('setListeningChannels(nextListening);') > claimIndex],
  ['mobile Listen does not immediately replay the selected player after a successful direct claim', !mobileBlock.includes('resumeAudioSelectedPlayers(')],
  ['iOS claim still unmutes before replaying a paused embed', app.includes('player.setMuted?.(false);') && app.includes('if (wasPaused) player.play?.();')],
  ['Dual return control remains in the mobile focus stream rail', app.includes('className="mobile-focus-return-dual"') && app.includes('onClick={returnToDual}')],
];

let failed = false;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed = true;
}

if (failed) process.exit(1);
console.log('\nSquadView Phase 3.1.4 Mobile Listen Gesture verification passed.');
