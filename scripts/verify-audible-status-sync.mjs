import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src', 'components', 'TwitchPlayer.jsx'), 'utf8');

const checks = [
  ['audible status state exists', app.includes('const [audibleChannels, setAudibleChannels] = useState(() => new Set());')],
  ['audible status is recomputed from displayed player targets', app.includes('function syncAudibleChannelStatus(policy = audioPolicyRef.current)')],
  ['audible status uses the same target resolver as mute/volume', app.includes('const target = getPlayerAudioTarget(channel, player, policy);')],
  ['viewer reconciliation updates status', app.includes('syncAudibleChannelStatus(nextPolicy);')],
  ['player visibility reconciliation updates status', app.includes('syncAudibleChannelStatus(audioPolicyRef.current);')],
  ['TwitchPlayer receives audioAudible', app.includes('audioAudible={audibleChannels.has(channel)}')],
  ['TwitchPlayer defaults audioAudible safely', player.includes('audioAudible = false,')],
  ['Listening status combines displayed state with live Twitch audio state', player.includes('const listening = Boolean(visible && liveAudible);')],
  ['live Twitch audible state exists', player.includes('const [liveAudible, setLiveAudible] = useState(Boolean(audioAudible));')],
  ['native mute state is read for status only', player.includes('const muted = player.getMuted?.();')],
  ['native volume state is read for status only', player.includes('const currentVolume = Number(player.getVolume?.());')],
];

let failures = 0;
console.log('===== SQUADVIEW AUDIBLE STATUS SYNC VERIFICATION =====');
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
}
if (failures) {
  console.log(`\n${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll audible-status sync checks passed.');
}
