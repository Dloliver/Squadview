#!/usr/bin/env node
// Behavioral regression against the *actual* existing App.jsx functions.
// Mocks a Twitch iframe that reports its old unmuted volume while a mute is
// being applied; no browser/network/production dependencies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repo = path.resolve(process.argv[2] || process.cwd());
const app = fs.readFileSync(path.join(repo, 'src/App.jsx'), 'utf8');
function extract(start, end) {
  const a = app.indexOf(`  function ${start}(`);
  const b = app.indexOf(`\n  function ${end}(`, a + 1);
  assert.ok(a >= 0 && b > a, `Function boundaries missing: ${start} / ${end}`);
  return app.slice(a, b).trim();
}
const snapshotCode = extract('snapshotAudioLevels', 'getPlayerAudioTarget');
const listenCode = extract('listenToChannel', 'toggleStreamLock');

function harness(selectedExtras) {
  const commands = [];
  const lead = {
    __squadViewPreferredVolume: 1,
    // The reported native state intentionally LAGS our programmatic mute.
    getMuted: () => false,
    getVolume: () => 1,
    isPaused: () => false,
    setMuted: (v) => commands.push(['leadMute', v]),
    setVolume: (v) => commands.push(['leadVolume', v]),
  };
  const others = Object.fromEntries(['beta','gamma','delta'].map(ch => [ch, {
    __squadViewManualVolume: 1,
    getMuted: () => false,
    getVolume: () => 1,
    isPaused: () => false,
    setMuted: () => {}, setVolume: () => {},
  }]));
  const channels = ['alpha','beta','gamma','delta'];
  const ctx = {
    Set, Number, Boolean, Math,
    channels,
    mobileDualAudioMix: false,
    mobileSingleAudioMode: false,
    viewMode: 'dual',
    activeChannel: 'alpha',
    audibleChannels: new Set(['alpha']),
    audioEnabled: true,
    focusedAudioVolumeRef: {current: 1},
    playersRef: {current: new Map([['alpha', lead], ...Object.entries(others)])},
    listeningChannels: new Set(selectedExtras),
    lastAppliedAudioPolicyRef: {current: {audioEnabled: true, activeChannel:'alpha'}},
    audioPolicyRef: {current: {audioEnabled: true, activeChannel:'alpha'}},
    cleanChannel: v => String(v || '').trim().toLowerCase(),
    clampFocusedAudioVolume: (value, fallback=1) => Number.isFinite(Number(value)) ? Math.max(0,Math.min(1,Number(value))) : fallback,
    getSessionChannelVolume: () => 1,
    rememberSessionChannelVolume: (_ch, value) => value,
    resumeAudioSelectedPlayers: () => {},
    audioPolicySelectsChannel: (policy, ch) => policy.audioEnabled && (ch === 'alpha' || ctx.listeningChannels.has(ch)),
    getPlayerAudioTarget: (ch, p) => ({targetVolume: ch === 'alpha' ? p.__squadViewPreferredVolume : p.__squadViewManualVolume}),
    setListeningChannels: next => {ctx.listeningChannels = next;},
    setAudioEnabled: next => {ctx.audioEnabled = next;},
    reconcileViewerAudio: (overrides={}, options={}) => {
      const previousPolicy = ctx.lastAppliedAudioPolicyRef.current;
      if (options.captureCurrent !== false) ctx.snapshotAudioLevels(previousPolicy);
      ctx.lastAppliedAudioPolicyRef.current = {audioEnabled: overrides.audioEnabled ?? ctx.audioEnabled, activeChannel: 'alpha'};
      commands.push(['reconcile', options.captureCurrent]);
      return ctx.lastAppliedAudioPolicyRef.current;
    },
  };
  vm.createContext(ctx);
  vm.runInContext(`${snapshotCode}\n${listenCode}\nthis.snapshotAudioLevels = snapshotAudioLevels; this.listenToChannel = listenToChannel;`, ctx);
  return {ctx, lead, commands};
}

{
  const {ctx, lead} = harness(['delta']);
  lead.__squadViewPreferredVolume = 0;
  ctx.focusedAudioVolumeRef.current = 0;
  ctx.snapshotAudioLevels({audioEnabled:true,activeChannel:'alpha'});
  assert.equal(ctx.focusedAudioVolumeRef.current, 0);
  assert.equal(lead.__squadViewPreferredVolume, 0);
  console.log('PASS: Stale Twitch volume cannot overwrite an explicitly muted 0% lead target');
}
{
  const {ctx, lead, commands} = harness(['delta']);
  ctx.listenToChannel('alpha', {listening:true});
  assert.equal(ctx.focusedAudioVolumeRef.current, 0);
  assert.equal(lead.__squadViewPreferredVolume, 0);
  assert.equal(ctx.audioEnabled, true, 'Other audio selection must stay enabled');
  assert.ok(ctx.listeningChannels.has('delta'), 'Other channel remains selected');
  assert.ok(commands.some(c => c[0] === 'leadMute' && c[1] === true));
  assert.ok(commands.some(c => c[0] === 'reconcile' && c[1] === false));
  console.log('PASS: Muting stream 1 retains stream 4 and skips recapturing stale lead volume');
}
{
  const {ctx, lead} = harness([]);
  ctx.listenToChannel('alpha', {listening:true});
  assert.equal(ctx.audioEnabled, false);
  assert.equal(ctx.focusedAudioVolumeRef.current, 0);
  ctx.listenToChannel('delta', {listening:false});
  assert.equal(ctx.audioEnabled, true);
  assert.ok(ctx.listeningChannels.has('delta'));
  assert.equal(ctx.focusedAudioVolumeRef.current, 0);
  assert.equal(lead.__squadViewPreferredVolume, 0);
  console.log('PASS: Enabling stream 4 after muting stream 1 does not revive stream 1');
}
{
  const {ctx, lead} = harness([]);
  ctx.focusedAudioVolumeRef.current=0;
  lead.__squadViewPreferredVolume=0;
  ctx.listenToChannel('alpha', {listening:false});
  assert.equal(ctx.focusedAudioVolumeRef.current, 1);
  assert.equal(lead.__squadViewPreferredVolume, 1);
  console.log('PASS: Explicitly selecting stream 1 restores its chosen volume');
}
console.log('PASS: Desktop lead Listening guard behavior passed');
