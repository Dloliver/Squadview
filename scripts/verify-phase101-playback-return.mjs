import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(process.argv[2] || process.cwd());
const sourcePath = path.join(root, 'src/components/TwitchPlayer.jsx');
const source = fs.readFileSync(sourcePath, 'utf8');
const begin = source.indexOf('function applyPlayerState(');
assert.ok(begin >= 0, 'Expected existing applyPlayerState function');
const ending = source.indexOf('\n}\n', begin);
assert.ok(ending > begin, 'Expected complete existing applyPlayerState function');
const body = source.slice(begin, ending + 2);
const counts = { schedules: 0, reconciles: 0 };
const playerState = vm.runInNewContext(`${body}\napplyPlayerState;`, {
  clearLiveEdgeTimers() {},
  applyWarmHiddenQuality() {},
  applyQualityPolicy() {},
  scheduleLiveEdgeCheck() { counts.schedules += 1; },
});

function setup({ paused = false, schedulerPaused = false, wasVisible = false,
  preserveAudibleSession = false, visible = true, keepPlaybackWarm = false } = {}) {
  const calls = { play: 0, pause: 0, mute: 0, volume: 0 };
  const player = {
    __squadViewWasVisible: wasVisible,
    __squadViewPausedByScheduler: schedulerPaused,
    __squadViewWarmHidden: false,
    __squadViewStateRef: { current: {} },
    isPaused: () => paused,
    play: () => { calls.play += 1; },
    pause: () => { calls.pause += 1; },
    setMuted: () => { calls.mute += 1; },
    setVolume: () => { calls.volume += 1; },
  };
  const state = {
    channel: 'testchannel', active: false, audioSelected: false,
    audioEnabled: true, allowBackgroundAudio: false,
    keepPlaybackWarm, visible, visibleCount: 4,
    preserveAudibleSession,
    reconcileAudio: () => { counts.reconciles += 1; },
  };
  return { calls, player, state };
}

const cases = [
  ['Returning desktop stream already playing: no redundant play()',
    { paused: false, schedulerPaused: false, wasVisible: false }, 0],
  ['Returning desktop stream actually paused: one play()',
    { paused: true, schedulerPaused: false, wasVisible: false }, 1],
  ['Scheduler-paused desktop stream: one recovery play()',
    { paused: false, schedulerPaused: true, wasVisible: false }, 1],
  ['iOS preservation: no unnecessary restart when playback reports active',
    { paused: false, schedulerPaused: true, wasVisible: false, preserveAudibleSession: true }, 0],
  ['Unchanged visible stream: no extra play()',
    { paused: false, schedulerPaused: false, wasVisible: true }, 0],
];

for (const [label, opts, expected] of cases) {
  const { player, state, calls } = setup(opts);
  playerState(player, state);
  assert.equal(calls.play, expected, label);
  console.log(`PASS: ${label}`);
}

{
  const { player, state, calls } = setup({ visible: false, keepPlaybackWarm: true, paused: false });
  playerState(player, state);
  assert.equal(calls.play, 0);
  assert.equal(calls.mute, 1);
  assert.equal(calls.volume, 1);
  console.log('PASS: Off-page warm playback behavior preserved');
}

assert.ok(counts.reconciles >= 6, 'Expected central audio reconciliation still called');
console.log('PASS: Playback scheduler still delegates audio reconciliation to App');
console.log('PASS: All playback-return tests passed');
