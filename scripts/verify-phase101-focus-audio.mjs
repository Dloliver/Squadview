import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(process.argv[2] || process.cwd());
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const playerSource = fs.readFileSync(path.join(root, 'src/components/TwitchPlayer.jsx'), 'utf8');

function selectFunction(source, declaration) {
  const start = source.indexOf(declaration);
  assert.ok(start >= 0, `Missing ${declaration}`);
  const end = source.indexOf('\n  }', start);
  assert.ok(end > start, `Missing function end ${declaration}`);
  return source.slice(start, end + 4);
}

const resumeSource = selectFunction(app, 'function resumeViewerChannelsFromGesture(');
const resumePlayers = new Map();
let activePlayCount = 0;
let pausedPlayCount = 0;
resumePlayers.set('playing', { isPaused: () => false, play: () => { activePlayCount += 1; } });
resumePlayers.set('paused', { isPaused: () => true, play: () => { pausedPlayCount += 1; } });
const resume = vm.runInNewContext(`(() => { ${resumeSource}; return resumeViewerChannelsFromGesture; })()`, {
  playersRef: { current: resumePlayers }, cleanChannel: (channel) => String(channel).toLowerCase(),
});
assert.match(app, /function returnToDual\(\)[\s\S]*?resumeViewerChannelsFromGesture\(resumeChannels\);/);
resume(['playing', 'paused', 'paused']);
assert.equal(activePlayCount, 0, 'Do not restart an already playing Twitch embed on Grid return');
assert.equal(pausedPlayCount, 1, 'Resume one paused player once under the Grid click');
console.log('PASS: Grid return uses gesture-scoped play only for paused streams');

const marker = 'keepPlaybackWarm={';
const exprStart = app.indexOf(marker, app.indexOf('<TwitchPlayer'));
assert.ok(exprStart >= 0, 'Expected existing keepPlaybackWarm prop on TwitchPlayer');
const exprEnd = app.indexOf('\n                    }', exprStart + marker.length);
assert.ok(exprEnd > exprStart, 'Expected complete keepPlaybackWarm expression');
const warmExpr = app.slice(exprStart + marker.length, exprEnd);
function warm(controls) {
  return Boolean(vm.runInNewContext(`(${warmExpr})`, {
    iosSingleAudioMode: false, mobileWarmPlaybackChannels: new Set(),
    isDesktopGrid: false, viewMode: 'dual', visibleChannels: [],
    desktopChannels: [], channel: 'two', ...controls,
  }));
}
assert.equal(warm({isDesktopGrid:true,viewMode:'solo',visibleChannels:['one'],desktopChannels:['one','two','three','four']}), true);
assert.equal(warm({isDesktopGrid:true,viewMode:'solo',visibleChannels:['one'],desktopChannels:['one','three','four']}), false);
assert.equal(warm({isDesktopGrid:true,viewMode:'dual',visibleChannels:['one'],desktopChannels:['one','two']}), false);
assert.equal(warm({isDesktopGrid:false,viewMode:'solo',visibleChannels:['one'],desktopChannels:['one','two']}), false);
assert.equal(warm({isDesktopGrid:true,viewMode:'solo',visibleChannels:['one'],desktopChannels:['one','two','three','four','five']}), false);
assert.equal(warm({iosSingleAudioMode:true,isDesktopGrid:false,viewMode:'solo',visibleChannels:['one'],mobileWarmPlaybackChannels:new Set(['two'])}), true);
console.log('PASS: Only current desktop Focus page (up to four) is warm; iOS cache unchanged');

const stateStart = playerSource.indexOf('function applyPlayerState(');
assert.ok(stateStart >= 0);
const stateEnd = playerSource.indexOf('\n}\n', stateStart);
assert.ok(stateEnd > stateStart);
const stateBody = playerSource.slice(stateStart, stateEnd+2);
const stateFn = vm.runInNewContext(`${stateBody}\napplyPlayerState;`, {
  clearLiveEdgeTimers() {}, applyWarmHiddenQuality() { return '160p'; },
  applyQualityPolicy() {}, scheduleLiveEdgeCheck() {},
});
const calls = { play:0, pause:0, mute:0, volume:0, reconciles:0 };
let paused = false;
const mock = {
  __squadViewWasVisible: true,
  __squadViewPausedByScheduler: false,
  __squadViewWarmHidden: false,
  __squadViewStateRef: {current:{}},
  isPaused: () => paused,
  play: () => { calls.play += 1; },
  pause: () => { calls.pause += 1; paused = true; },
  setMuted: () => { calls.mute += 1; },
  setVolume: () => { calls.volume += 1; },
};
const state = {channel:'two',active:false,audioSelected:false,audioEnabled:true,
  allowBackgroundAudio:false,keepPlaybackWarm:true,visible:false,visibleCount:4,
  preserveAudibleSession:false,reconcileAudio:()=>{calls.reconciles+=1;}};
stateFn(mock,state);
assert.equal(calls.pause,0);
assert.equal(mock.__squadViewWarmHidden,true);
assert.equal(calls.mute,1);
assert.equal(calls.volume,1);
stateFn(mock,{...state,keepPlaybackWarm:false,visible:true});
assert.equal(calls.play,0, 'Warm desktop return should not issue redundant playback');
assert.equal(mock.__squadViewLiveEdgeStatus, 'warm_returned');
console.log('PASS: Warm Focus keeps hidden videos muted and returns without pausing/restarting');

const pollStart = playerSource.indexOf('const syncLiveAudioStatus = () => {');
const pollEnd = playerSource.indexOf('\n\n    syncLiveAudioStatus();',pollStart);
assert.ok(pollStart > 0 && pollEnd > pollStart);
const pollSnippet = playerSource.slice(pollStart,pollEnd);
function liveState({muted=false,volume=0.5,paused=false,playerAvailable=true,desired=true}={}) {
  let audible = null;
  const playerRef = {current:playerAvailable ? {
    getMuted:()=>muted,getVolume:()=>volume,isPaused:()=>paused,
  }:null};
  const poll = vm.runInNewContext(`(() => { ${pollSnippet}; return syncLiveAudioStatus; })()`, {
    playerRef, audioAudible:desired, active:true, focusVolume:0.5,audioVolume:0.5,
    setLiveAudible:(v)=>{audible = v;},setMobileVolumePercent:()=>{},
    nativeAudioMismatchCountRef:{current:0},lastReportedNativeAudioRef:{current:''},
    onLiveAudioStateChange:()=>{},channel:'two',
  });
  poll();return audible;
}
assert.equal(liveState({paused:true}),false,'A paused Twitch player is not Listening');
assert.equal(liveState({muted:true}),false,'A muted Twitch player is not Listening');
assert.equal(liveState({volume:0}),false,'Zero volume is not Listening');
assert.equal(liveState({muted:null}),false,'Unconfirmed Twitch mute state is not Listening');
assert.equal(liveState({playerAvailable:false}),false,'Missing player is not Listening');
assert.equal(liveState({paused:false,muted:false,volume:0.5}),true,'Confirmed Twitch playback is Listening');
assert.equal(liveState({paused:true,desired:true}),false,'Desired audio must not override actual pause');
console.log('PASS: Listening status requires confirmed unmuted, nonzero, playing Twitch state');

assert.match(playerSource,/if \(mobileSingleAudioMode\) \{[\s\S]*?setLiveAudible\(Boolean\(visible && audioSelected && nextVolume > 0\)\);/);
console.log('PASS: Existing mobile volume interaction preserved');
console.log('PASS: All SquadView 1.0.1 Focus/playback/audio regressions passed');
