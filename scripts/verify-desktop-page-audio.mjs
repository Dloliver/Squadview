import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chooseDesktopPageAudioFallback as choose } from '../src/lib/desktopPageAudio.js';

function test(label, inputs, expected) {
  assert.equal(choose(inputs), expected, label);
  console.log(`PASS: ${label}`);
}
const initial = { audioEnabled: true, activeChannel: 'alpha', activeVolume: 1, listeningChannels: [], explicitlyMuted: [] };
test('Page 2 takes first visible channel when old owner is off page', {...initial, visibleChannels: ['delta','echo','foxtrot']}, 'delta');
test('Page 2 takes no extra stream when a manually selected stream is visible', {...initial, visibleChannels:['delta','echo'], listeningChannels: new Set(['echo'])}, '');
test('Pinned active lead stays selected without duplicate Listen', {...initial, visibleChannels:['alpha','delta']}, '');
test('Disabled audio never activates a new page', {...initial, audioEnabled:false, visibleChannels:['delta','echo']}, '');
test('Intentional mute on page prevents surprise audio', {...initial, visibleChannels:['delta','echo'], explicitlyMuted:new Set(['delta'])}, '');
test('Mute on a previous page does not block a new page', {...initial, visibleChannels:['delta','echo'], explicitlyMuted:new Set(['alpha'])}, 'delta');
test('Returning to an already-selected page retains saved mix', {...initial, visibleChannels:['delta','echo'], listeningChannels:new Set(['delta'])}, '');
test('No visible streams means silence', {...initial, visibleChannels:[]}, '');
test('Dedupes empty channel names', {...initial, visibleChannels:['','','delta','delta']}, 'delta');
test('No fallback for a muted focused channel alone', {...initial, activeVolume:0, visibleChannels:['alpha']}, '');

const app=fs.readFileSync('src/App.jsx','utf8');
const player=fs.readFileSync('src/components/TwitchPlayer.jsx','utf8');
assert.match(app, /import \{ chooseDesktopPageAudioFallback \} from '\.\/lib\/desktopPageAudio';/);
assert.match(app, /const pageAudioFallback = chooseDesktopPageAudioFallback\(/);
const pager = app.slice(app.indexOf('const moveDesktopPage = (direction) =>'),app.indexOf('const previousDesktopPage = () =>'));
assert(pager.includes('setListeningChannels((current) => new Set([...current, pageAudioFallback]));'));
assert(pager.indexOf('const pageAudioFallback') < pager.indexOf('setDesktopPage(nextPage)'));
assert(pager.includes('resumeViewerChannelsFromGesture(nextVisibleChannels);'));
assert(app.includes('desktopExplicitMutedChannelsRef.current = new Set();'));
assert(app.includes('desktopExplicitMutedChannelsRef.current.add(cleaned)'));
assert(app.includes('desktopExplicitMutedChannelsRef.current.delete(cleaned)'));
console.log('PASS: page navigation keeps existing gesture resume and records safe audio fallback');
assert(player.includes("const statusPollMs = window.matchMedia?.('(min-width: 761px)').matches ? 750 : 300;"));
assert(player.includes('window.setInterval(syncLiveAudioStatus, statusPollMs);'));
assert(player.includes('const listening = Boolean(visible && liveAudible);'));
assert(player.includes('preserveAudibleSession && visible && audioSelected && audioEnabled'));
assert(player.includes('registerPlayer('));
console.log('PASS: desktop status polling eased; mobile status and Twitch player mounting preserved');
console.log('PASS: desktop page audio and status polling tests complete (browser acceptance still required)');
