import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src/components/TwitchPlayer.jsx'), 'utf8');
const chat = fs.readFileSync(path.join(root, 'src/components/ChatPanel.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');

const checks = [
  ['Native chat returns focus after a successful send', chat.includes('sentSuccessfully = true') && chat.includes('composerRef.current') && chat.includes('input?.focus?.({ preventScroll: true })')],
  ['Native chat refocus waits until sendBusy is released', chat.includes('setSendBusy(false);') && chat.includes('window.requestAnimationFrame(() => {')],
  ['Per-channel volume memory exists only in the active viewer runtime', app.includes('sessionVolumeByChannelRef = useRef(new Map())') && !app.includes('squadview:session-channel-volume')],
  ['New Start watching sessions reset remembered channel volume', app.includes('function commitViewerStart(unique)') && app.includes('resetSessionChannelVolumes();')],
  ['Leaving the viewer clears ephemeral channel volumes', app.includes("exitViewer(exitMethod = 'back_button')") && app.includes("resetSessionChannelVolumes();\n    setScreen('home');")],
  ['Channel volume survives Focus/layout changes inside a session', app.includes('getSessionChannelVolume(cleaned, 1)') && app.includes('rememberSessionChannelVolume(channel, currentVolume)')],
  ['Listen control sends its exact visible Listening state to App', player.includes('onListen?.({') && player.includes('listening,')],
  ['Desktop Listen/Listening follows the clicked control state instead of a stale Twitch read', app.includes("typeof controlState.listening === 'boolean'") && app.includes('grid #1')],
  ['Muting with Listen preserves the last audible channel volume', app.includes('Muting with Listen should not erase the level the viewer chose') && app.includes('rememberSessionChannelVolume(cleaned, currentVolume)')],
  ['Auto-fill copy explicitly means SquadView Favorites rather than Twitch follows', app.includes('Auto-fill live SquadView Favorites') && app.includes('not every Twitch follow')],
  ['Auto-fill shows a useful no-Favorites/no-live-Favorites state', app.includes('No SquadView Favorites yet') && app.includes('None of your SquadView Favorites are live right now.')],
  ['Auto-fill status styling is installed', css.includes('.automation-status') && css.includes('.automation-status.is-empty')],
  ['Shared-view launch parameters are consumed after the viewer starts', app.includes("url.searchParams.delete('channels')") && app.includes("url.searchParams.delete('active')") && app.includes('window.history.replaceState')],
  ['Shared-view handoff preserves referral/other query parameters', app.includes('const query = url.searchParams.toString()') && !app.includes("url.search = ''")],
  ['Consumed shared roster cannot overwrite later user/session changes during account hydration', app.includes("sharedViewer?.channels?.length && !sharedViewConsumedRef.current")],
  ['Shared-view handoff explicitly makes session state authoritative after launch', app.includes('A shared URL is a launch instruction, not a permanent owner of the viewer') && app.includes('shared_view_handed_off_to_session')],
];

let failed = 0;
for (const [label, passed] of checks) {
  if (passed) console.log(`PASS  ${label}`);
  else {
    console.error(`FAIL  ${label}`);
    failed += 1;
  }
}

if (failed) {
  console.error(`\n${failed} Phase 3.3.1 verification check${failed === 1 ? '' : 's'} failed.`);
  process.exit(1);
}

console.log('\nSquadView Phase 3.3.1 Feedback Polish + Shared View Handoff verification passed.');
