import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');

const checks = [
  ['mobile Listen action follows live Twitch audibility', app.includes("const currentOwner = actuallyAudible ? cleaned : '';") && app.includes('if (currentOwner === cleaned)')],
  ['mobile Listen retry is not blocked by stale audioEnabled intent', !app.includes("const currentOwner = audioEnabled ? (manualOwner || activeChannel) : '';")],
  ['mobile Listen keeps failed iOS claims retryable', app.includes('Keep the selection retryable') && app.includes('claimMobileAudioFromGesture(')],
  ['mobile audio claim unmutes before replaying a paused embed', app.includes('player.setMuted?.(false);') && app.includes('if (wasPaused) player.play?.();')],
  ['mobile Listening tap still mutes and returns to silence', app.includes('currentPlayer?.setMuted?.(true);') && app.includes('setAudioEnabled(false);')],
  ['mobile Focus selector exposes a Dual return control', app.includes('mobile-focus-return-dual') && app.includes('onClick={returnToDual}')],
  ['mobile Focus/Chat footer no longer consumes layout height', css.includes('.viewer-shell.mode-solo .viewer-toolbar') && css.includes('.viewer-shell.mode-chat .viewer-toolbar') && css.includes('display: none !important;')],
  ['Dual return control is compact inside the top stream rail', css.includes('.mobile-focus-stream-selector .mobile-focus-return-dual') && css.includes('min-width: 70px;')],
];

let failed = false;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed = true;
}

if (failed) process.exit(1);
console.log('\nSquadView Phase 3.1.3 Mobile Listen + Chat Space verification passed.');
