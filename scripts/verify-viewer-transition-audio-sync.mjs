import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'src', 'App.jsx');
const playerPath = path.join(root, 'src', 'components', 'TwitchPlayer.jsx');

const app = fs.readFileSync(appPath, 'utf8');
const player = fs.readFileSync(playerPath, 'utf8');

const checks = [
  ['native Twitch audio intent sync exists', app.includes('syncNativeTwitchAudioIntent')],
  ['native audio callback wired to player', app.includes('onLiveAudioStateChange={syncNativeTwitchAudioIntent}')],
  ['desktop chat resumes next visible streams', app.includes('resumeViewerChannelsFromGesture(nextVisibleChannels)')],
  ['page transition calculates next visible streams', app.includes('const nextPage = (desktopPageForRender + direction + desktopPageCount) % desktopPageCount;')],
  ['player exposes native audio callback', player.includes('onLiveAudioStateChange,')],
  ['player reports native mute and volume', player.includes('onLiveAudioStateChange?.(channel, {') && player.includes('volume: clampedVolume')],
  ['paused state is not written into audio intent callback', !player.includes('onLiveAudioStateChange?.(channel, {\n              muted: muted === true,\n              volume: clampedVolume,\n              paused:')],
  ['mismatch guard protects layout transitions', player.includes('nativeAudioMismatchCountRef.current >= 2')],
  ['Manage Streams draft remains installed', app.includes('managerDraftChannels') && app.includes('managerKnownLiveChannels')],
  ['offscreen audio remains disabled', app.includes('allowBackgroundAudio={false}')],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}

console.log('');
if (failed) {
  console.log(`Viewer transition audio sync verification found ${failed} problem(s).`);
  process.exitCode = 1;
} else {
  console.log('Viewer transition audio sync verification passed.');
}
