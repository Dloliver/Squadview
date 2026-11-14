import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(process.argv[2] || process.cwd());
const player = fs.readFileSync(path.join(root, 'src/components/TwitchPlayer.jsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');

function block(start, end) {
  const a = player.indexOf(start);
  const b = player.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Missing block ${start}`);
  return player.slice(a, b);
}
const scheduler = block('function applyPlayerState(', "\nif (typeof window !== 'undefined')");
const resync = block('function forceLiveResync(', '\nfunction scheduleLiveEdgeCheck(');
const callbacks = block('const refreshPlayerState =', 'player.addEventListener(\n          Twitch.Player.SEEK');

assert.doesNotMatch(scheduler, /applyQualityPolicy\s*\(/,
  'Visible and returning players must not force quality');
assert.doesNotMatch(scheduler, /applyWarmHiddenQuality\s*\(/,
  'Warm off-page players must retain the already playing rendition');
assert.doesNotMatch(resync, /applyQualityPolicy\s*\(/,
  'Live-edge resync must not force a new rendition');
assert.match(callbacks, /Twitch\.Player\.READY/);
assert.match(callbacks, /Twitch\.Player\.PLAYING/);
assert.match(callbacks, /refreshPlayerState\(\);/);
assert.equal((player.match(/\bapplyQualityPolicy\s*\(/g) || []).length, 1,
  'Legacy helper is defined, but never invoked');
assert.equal((player.match(/\bapplyWarmHiddenQuality\s*\(/g) || []).length, 1,
  'Warm quality helper is defined, but never invoked');
console.log('PASS: READY/PLAYING do not force 480p or any rendition.');
console.log('PASS: Warm Focus/off-page and live-edge recovery retain Twitch selected quality.');

// Verify normal playback and warm-return state still reconcile audio while
// never reaching a quality helper if those helpers were to throw.
const fnStart = player.indexOf('function applyPlayerState(');
const fnEnd = player.indexOf('\n}\n', fnStart);
assert.ok(fnEnd > fnStart);
const fnSource = player.slice(fnStart, fnEnd+2);
const stateFn = vm.runInNewContext(`${fnSource}\napplyPlayerState;`, {
  clearLiveEdgeTimers() {},
  applyWarmHiddenQuality() { throw new Error('Unexpected quality call on warm player'); },
  applyQualityPolicy() { throw new Error('Unexpected quality call on visible player'); },
  scheduleLiveEdgeCheck() {},
});
const effects = {pause:0, play:0, muted:0, volume:0, reconcile:0};
const embed = {
  __squadViewWasVisible: true,
  __squadViewPausedByScheduler: false,
  __squadViewWarmHidden: false,
  __squadViewStateRef: {current:{}},
  isPaused:()=>false,
  pause:()=>{effects.pause++;},
  play:()=>{effects.play++;},
  setMuted:()=>{effects.muted++;},
  setVolume:()=>{effects.volume++;},
};
const base = { channel:'spongiebaby', active:false, audioSelected:false, audioEnabled:true,
  allowBackgroundAudio:false, keepPlaybackWarm:false, visible:true, visibleCount:4,
  preserveAudibleSession:false, reconcileAudio:()=>{effects.reconcile++;} };
stateFn(embed, base);
assert.equal(effects.reconcile,1);
assert.equal(effects.play,0);
stateFn(embed, {...base,visible:false,keepPlaybackWarm:true});
assert.equal(effects.pause,0);
assert.equal(effects.muted,1);
stateFn(embed,base);
assert.equal(embed.__squadViewLiveEdgeStatus,'warm_returned');
assert.equal(effects.play,0,'Warm Focus returns without restarting');
assert.equal(effects.reconcile,3,'Reconcile audio at all transitions');
console.log('PASS: Visible four-player, warm Focus and return preserve existing audio behavior.');
assert.match(app,/desktopPageAudio/);
assert.match(player,/statusPollMs = window\.matchMedia\?\./);
console.log('PASS: Existing desktop paging-audio and status-poll fixes remain in place.');
console.log('PASS: Twitch Auto startup guard tests complete. Browser verification still required.');
