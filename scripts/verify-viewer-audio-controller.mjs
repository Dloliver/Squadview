import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'src', 'App.jsx');
const playerPath = path.join(root, 'src', 'components', 'TwitchPlayer.jsx');
const app = fs.readFileSync(appPath, 'utf8');
const player = fs.readFileSync(playerPath, 'utf8');

let failed = false;

function pass(label) { console.log(`PASS  ${label}`); }
function fail(label, detail = '') { failed = true; console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
function requireText(source, text, label) { source.includes(text) ? pass(label) : fail(label, `missing ${JSON.stringify(text)}`); }
function between(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  if (start === -1) { fail(label, `missing start marker ${JSON.stringify(startMarker)}`); return ''; }
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end === -1) { fail(label, `missing end marker ${JSON.stringify(endMarker)}`); return ''; }
  return source.slice(start, end);
}

console.log('======================================================');
console.log(' SQUADVIEW VIEWER AUDIO CONTROLLER VERIFICATION');
console.log('======================================================');

requireText(app, 'const audioPolicyRef = useRef(null);', 'single audio policy ref installed');
requireText(app, 'const lastAppliedAudioPolicyRef = useRef(null);', 'last applied audio policy ref installed');
requireText(app, 'const focusReturnAudioRef = useRef(null);', 'Focus return audio snapshot installed');
requireText(app, "? 'mobile-chat'", 'mobile Chat has explicit audio mode');
requireText(app, ": 'mix';", 'desktop Grid/Chat share the same mix mode');
requireText(app, 'function audioPolicySelectsChannel(policy, channel)', 'central selection resolver installed');
requireText(app, 'function getPlayerAudioTarget(channel, player = playersRef.current.get(channel), policy = audioPolicyRef.current)', 'central displayed/audio target resolver installed');
requireText(app, 'const selected = displayed && audioPolicySelectsChannel(policy, channel);', 'central target resolver gates sound by displayed tile');
requireText(app, 'function applyAudioPolicyToPlayer(channel, player = playersRef.current.get(channel), policy = audioPolicyRef.current)', 'central player audio writer installed');
requireText(app, 'function reconcileViewerAudio(overrides = {}, { captureCurrent = true } = {})', 'central reconciliation installed');
requireText(app, 'desiredAudioChannels:', 'audio debug exposes desired channels');
requireText(app, 'audibleChannels: [...audibleChannels],', 'audio debug exposes current audible channels');
requireText(app, 'onAudioReconcile={reconcilePlayerAudio}', 'Twitch player receives central audio reconcile callback');
requireText(app, 'allowBackgroundAudio={false}', 'viewer disables off-page background audio');

const desktopChat = between(
  app,
  "    if (isDesktopGrid) {\n      // Desktop Chat owns chat selection and layout only.",
  "    // Mobile Chat is one displayed Twitch stream plus that same stream's chat.",
  'desktop Chat branch found',
);
if (desktopChat) {
  const forbidden = ['reconcileViewerAudio(', 'setAudioEnabled(', 'setActiveChannel(', 'setListeningChannels(', '.setMuted', '.setVolume'];
  const hits = forbidden.filter((item) => desktopChat.includes(item));
  if (!hits.length) pass('desktop Chat cannot rewrite audio state');
  else fail('desktop Chat cannot rewrite audio state', `found ${hits.join(', ')}`);
}

const appAudioWrites = [...app.matchAll(/\.set(?:Muted|Volume)\?*\.?\(/g)].map((match) => match.index);
const centralWriter = between(app, '  function applyAudioPolicyToPlayer(', '\n\n  function reconcileViewerAudio', 'central writer block found');
const expectedAppWrites = [...centralWriter.matchAll(/\.set(?:Muted|Volume)\?*\.?\(/g)].length;
if (appAudioWrites.length === expectedAppWrites && expectedAppWrites === 2) pass('App final mute/volume writes exist only in central controller');
else fail('App final mute/volume writes exist only in central controller', `App=${appAudioWrites.length}, central=${expectedAppWrites}`);

const scheduler = between(player, 'function applyPlayerState(', "\n\nif (typeof window !== 'undefined')", 'Twitch playback scheduler found');
if (scheduler) {
  const forbidden = ['setMuted', 'setVolume'];
  const hits = forbidden.filter((item) => scheduler.includes(item));
  if (!hits.length) pass('Twitch playback scheduler never owns mute/volume');
  else fail('Twitch playback scheduler never owns mute/volume', `found ${hits.join(', ')}`);
  requireText(scheduler, 'audioEnabled &&\n    allowBackgroundAudio,', 'off-page playback requires explicit background-audio permission');
  if (!scheduler.includes('(active || allowBackgroundAudio)')) pass('active channel no longer bypasses display-only audio rule');
  else fail('active channel no longer bypasses display-only audio rule');
}

requireText(player, 'const listening = Boolean(visible && liveAudible);', 'Listening label follows live displayed player audio state');
requireText(player, 'state.reconcileAudio?.(channel, player);', 'visibility transitions hand final audio back to controller');
requireText(player, 'stateRef.current.reconcileAudio?.(channel, player);', 'READY/PLAYING recovery hands audio back to controller');
requireText(player, 'latestState.reconcileAudio?.(latestState.channel, player);', 'live-edge resync hands audio back to controller');

console.log('------------------------------------------------------');
if (failed) {
  console.error('Viewer audio controller verification FAILED.');
  process.exitCode = 1;
} else {
  console.log('Viewer audio controller verification PASSED.');
}
console.log('======================================================');
