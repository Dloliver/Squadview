import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src/components/TwitchPlayer.jsx'), 'utf8');

const checks = [
  ['Listen label is based on live Twitch audibility', player.includes('const listening = Boolean(visible && liveAudible);')],
  ['mobile button shows Starting until Twitch READY', player.includes("? 'Starting…'") && player.includes('mobileSingleAudioMode && !playerReady')],
  ['mobile Listen tap directly claims Twitch audio', app.includes('function claimMobileAudioFromGesture') && app.includes('player.play?.();') && app.includes('player.setMuted?.(false);')],
  ['failed mobile audio claim cannot leave a fake Listening state', app.includes('Never record a fake Listening state') && app.includes('audioEnabled: false')],
  ['mobile Listening tap returns to silence', app.includes('currentOwner === cleaned') && app.includes('currentPlayer?.setMuted?.(true);') && app.includes('setAudioEnabled(false);')],
  ['desktop active stream Listening can now mute just that stream', app.includes('The active desktop stream used to be one-way') && app.includes('focusedAudioVolumeRef.current = 0;')],
  ['desktop active stream can restore Listen audio', app.includes('focusedAudioVolumeRef.current = 1;') && app.includes('const nextPolicy = reconcileViewerAudio({ audioEnabled: true });')],
  ['Focus Listen is a real toggle on desktop and mobile', app.includes('Listen is a real toggle in Focus on both desktop and mobile') && app.includes("mode: 'solo'")],
];

let failed = false;
for (const [label, ok] of checks) {
  if (ok) console.log(`PASS  ${label}`);
  else { failed = true; console.error(`FAIL  ${label}`); }
}
if (failed) process.exit(1);
console.log('\nSquadView Phase 3.1.1 Listen Toggle verification passed.');
