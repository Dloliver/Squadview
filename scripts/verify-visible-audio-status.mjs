import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const playerPath = new URL('../src/components/TwitchPlayer.jsx', import.meta.url);
const app = fs.readFileSync(appPath, 'utf8');
const player = fs.readFileSync(playerPath, 'utf8');

const checks = [
  ['App gates final audio by displayed Twitch state', app.includes('const selected = displayed && audioPolicySelectsChannel(policy, channel);')],
  ['App does not resume audio-selected hidden players', app.includes('if (!displayed) return;')],
  ['App disables background audio for Twitch tiles', app.includes('allowBackgroundAudio={false}')],
  ['Old desktop background-audio prop is gone', !app.includes("allowBackgroundAudio={isDesktopGrid && !iosSingleAudioMode && viewMode !== 'solo'}")],
  ['Twitch scheduler requires explicit background-audio permission', player.includes('audioEnabled &&\n    allowBackgroundAudio,')],
  ['Twitch visibility transitions reconcile audio', (player.match(/state\.reconcileAudio\?\.\(channel, player\);/g) || []).length >= 3],
  ['App tracks current audible channels separately from remembered Listen intent', app.includes('const [audibleChannels, setAudibleChannels] = useState(() => new Set());')],
  ['App resyncs audible status after viewer audio reconciliation', app.includes('syncAudibleChannelStatus(nextPolicy);')],
  ['App resyncs audible status after a player visibility transition', app.includes('syncAudibleChannelStatus(audioPolicyRef.current);')],
  ['Twitch player receives current audible status from the controller', app.includes('audioAudible={audibleChannels.has(channel)}')],
  ['Listening UI follows live displayed audible status', player.includes('const listening = Boolean(visible && liveAudible);')],
  ['Visible player status polls Twitch mute state', player.includes('const muted = player.getMuted?.();')],
  ['Visible player status polls Twitch volume state', player.includes('const currentVolume = Number(player.getVolume?.());')],
  ['Listen can restore a zero-volume desktop stream', app.includes('if (currentVolume <= 0) {\n        if (player) player.__squadViewManualVolume = 1;')],
  ['Focused Listen can recover from zero volume', app.includes('focusedAudioVolumeRef.current = 1;')],
];

let failed = 0;
console.log('===== SQUADVIEW VISIBLE AUDIO + STATUS VERIFICATION =====');
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}

if (failed) {
  console.log(`\n${failed} verification check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll visible-audio/status checks passed.');
}
