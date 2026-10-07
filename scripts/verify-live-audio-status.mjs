import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const player = fs.readFileSync(path.join(root, 'src', 'components', 'TwitchPlayer.jsx'), 'utf8');

const checks = [
  ['live audible state installed', player.includes('const [liveAudible, setLiveAudible] = useState(Boolean(audioAudible));')],
  ['only hidden streams hard-clear live status', player.includes('if (!visible) {\n      setLiveAudible(false);')],
  ['visible native-audio polling is not gated by audioSelected', !player.includes('if (!visible || !audioSelected || !audioEnabled)')],
  ['status reads Twitch native mute', player.includes('const muted = player.getMuted?.();')],
  ['status reads Twitch native volume', player.includes('const currentVolume = Number(player.getVolume?.());')],
  ['status reads Twitch paused state', player.includes('const paused = player.isPaused?.();')],
  ['live audible requires unmuted player', player.includes('muted !== true &&')],
  ['live audible requires playing player', player.includes('paused !== true &&')],
  ['live audible requires volume above zero', player.includes('clampedVolume > 0')],
  ['all visible players are polled', player.includes('const statusTimer = window.setInterval(syncLiveAudioStatus, 300);')],
  ['Listening remains visible plus live state', player.includes('const listening = Boolean(visible && liveAudible);')],
  ['poll does not write Twitch mute state', !player.slice(player.indexOf('const syncLiveAudioStatus = () => {'), player.indexOf('syncLiveAudioStatus();', player.indexOf('const syncLiveAudioStatus = () => {'))).includes('setMuted')],
  ['poll does not write Twitch volume state', !player.slice(player.indexOf('const syncLiveAudioStatus = () => {'), player.indexOf('syncLiveAudioStatus();', player.indexOf('const syncLiveAudioStatus = () => {'))).includes('setVolume?.(')],
];

let failed = 0;
console.log('===== SQUADVIEW LIVE TWITCH AUDIO STATUS VERIFICATION =====');
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}

if (failed) {
  console.log(`\n${failed} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll live Twitch audio-status checks passed.');
}
