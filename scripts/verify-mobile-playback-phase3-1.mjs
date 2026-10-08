import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src/components/TwitchPlayer.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');

const checks = [
  ['desktop lead audio behavior stays intact while mobile starts muted', app.includes('setAudioEnabled(isDesktopGrid ? Boolean(unique[0]) : false);')],
  ['mobile still uses exactly one audio owner', app.includes('const mobileSingleAudioMode = !isDesktopGrid;') && app.includes('muteOtherMobilePlayers(channel);')],
  ['mobile Listen claims Twitch audio inside the user gesture', app.includes('function claimMobileAudioFromGesture') && app.includes('player.setMuted?.(false);')],
  ['mobile silence toggle mutes immediately', app.includes('currentPlayer?.setMuted?.(true);') && app.includes('audioEnabled: false')],
  ['mobile Focus/Chat can claim the focused stream from the tap', app.includes('nextFocusAudioEnabled = claimMobileAudioFromGesture') && app.includes('audioEnabled: nextFocusAudioEnabled')],
  ['mobile Focus exposes Listen recovery when a new Twitch player was not READY during the first tap', app.includes("viewMode === 'solo'") && app.includes('player.__squadViewReady !== true') && app.includes("mode: 'solo'")],
  ['Twitch player exposes READY state for reliable mobile Listen', player.includes('player.__squadViewReady = true;') && player.includes('setPlayerReady(true);')],
  ['mobile Listen waits for READY rather than pretending audio started', player.includes("? 'Starting…'") && player.includes('mobileSingleAudioMode && !playerReady')],
  ['iOS-only warm playback history is capped to the previous mobile layout', app.includes('mobileWarmPlaybackHistoryRef') && app.includes('history.previous = history.current.slice(0, 2);')],
  ['Android stays on existing scheduler until separately tested', app.includes('Android') && app.includes('stays on the existing pause/resume policy')],
  ['only hidden iOS players from the warm set get warm playback', app.includes('iosSingleAudioMode &&') && app.includes('mobileWarmPlaybackChannels.has(channel)')],
  ['warm hidden Twitch embeds are muted instead of scheduler-paused', player.includes("player.__squadViewLiveEdgeStatus = 'warm_off_page';") && player.includes('if (keepPlaybackWarm)')],
  ['warm returns skip the normal play/resync startup path', player.includes('returningFromWarmPage') && player.includes("player.__squadViewLiveEdgeStatus = 'warm_returned';")],
  ['warm hidden players drop to a low quality target', player.includes('applyWarmHiddenQuality') && player.includes('qualityAtHeight(qualities, 160)')],
  ['iOS warm iframe remains paintable offscreen to discourage WebKit suspension', css.includes('.stream-card.is-hidden.is-warm-hidden') && css.includes('visibility: visible; opacity: 0;')],
];

let failed = false;
for (const [label, ok] of checks) {
  if (ok) console.log(`PASS  ${label}`);
  else { failed = true; console.error(`FAIL  ${label}`); }
}
if (failed) process.exit(1);
console.log('\nSquadView Phase 3.1 Mobile Audio + iOS Warm Playback verification passed.');
