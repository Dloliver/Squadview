import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { selectBoundedMountedChannels } from '../src/lib/viewerPlayerMounts.js';

const root = path.resolve(process.cwd());
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');

const choose = (previouslyMounted, roster, visible, warm = []) => selectBoundedMountedChannels({
  previouslyMounted, roster, visible, warm,
});

assert.deepEqual(choose([], ['a','b','c','d'], ['a','b']), ['a','b']);
assert.deepEqual(choose(['a','b'], ['a','b','c','d'], ['c','d']), ['c','d']);
assert.deepEqual(choose(['c','d'], ['a','b','c','d'], ['c','b']), ['c','b']);
assert.deepEqual(choose(['a','b','c'], ['a','b'], ['b','a'], ['c']), ['a','b']);
assert.deepEqual(choose(['a','b'], ['a','b','c'], ['a'], ['b']), ['a','b']);
assert.deepEqual(choose(['a','b'], ['a','b','c'], ['a'], ['b','b','c']), ['a','b','c']);
console.log('PASS: Helper retains only eligible visible/warm channels with stable keys');

assert.match(app, /import \{ selectBoundedMountedChannels \} from '\.\/lib\/viewerPlayerMounts';/);
assert.match(app, /mountedPlayerChannelsRef\.current = new Set\(mountedChannels\);/);
assert.doesNotMatch(app, /mountedPlayerChannelsRef\.current\.add\(channel\)/);
assert.match(app, /\{mountedChannels\.map\(\(channel\) => \(/);
assert.match(app, /<TwitchPlayer\s+key=\{channel\}/);

const start = app.indexOf('    // Viewer Core A: an iframe belongs');
const end = app.indexOf('    const mobileManualAudioOwner', start);
assert.ok(start > 0 && end > start, 'Expected exact Viewer Core A mount integration');
const fragment = app.slice(start, end);
function evaluate(ctx) {
  const context = {
    mountedPlayerChannelsRef: { current: new Set(ctx.previouslyMounted || []) },
    channels: ctx.channels || [], visibleChannels: ctx.visibleChannels || [],
    desktopChannels: ctx.desktopChannels || [],
    mobileWarmPlaybackChannels: new Set(ctx.mobileWarmPlaybackChannels || []),
    iosSingleAudioMode: !!ctx.iosSingleAudioMode,
    isDesktopGrid: !!ctx.isDesktopGrid,
    viewMode: ctx.viewMode || 'dual',
    selectBoundedMountedChannels,
  };
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(() => {${fragment}
 return [mountedChannels, [...mountedPlayerChannelsRef.current]]; })()`, context)));
}
const list = Array.from({length:16}, (_, i)=>`stream${i+1}`);
const normal = evaluate({
  previouslyMounted:list.slice(0,12), channels:list, visibleChannels:list.slice(12,16),
  desktopChannels:list.slice(12,16), isDesktopGrid:true, viewMode:'dual',
});
assert.deepEqual(normal[0],list.slice(12,16), 'Earlier desktop pages must be released');
assert.deepEqual(normal[0],normal[1], 'Ref should hold only the current bounded set');
console.log('PASS: Desktop pages 1-3 are released on page 4 instead of accumulating 16 iframes');

const focused = evaluate({
  previouslyMounted:list.slice(0,4), channels:list, visibleChannels:['stream3'],
  desktopChannels:list.slice(0,4), isDesktopGrid:true, viewMode:'solo',
});
assert.deepEqual(focused[0],list.slice(0,4), 'Focus retains the original four in stable order');
const returnGrid = evaluate({
  previouslyMounted:focused[0], channels:list, visibleChannels:list.slice(0,4),
  desktopChannels:list.slice(0,4), isDesktopGrid:true, viewMode:'dual',
});
assert.deepEqual(returnGrid[0],list.slice(0,4));
console.log('PASS: Desktop Focus ↔ Grid preserves all four existing Twitch iframe identities');

const focusOtherPage = evaluate({
  previouslyMounted:list.slice(0,8), channels:list, visibleChannels:['stream9'],
  desktopChannels:list.slice(8,12), isDesktopGrid:true, viewMode:'solo',
});
assert.deepEqual(focusOtherPage[0],['stream9','stream10','stream11','stream12']);
const mobile = evaluate({
  previouslyMounted:list.slice(0,8), channels:list, visibleChannels:['stream7'],
  mobileWarmPlaybackChannels:['stream5','stream6'], isDesktopGrid:false,
  iosSingleAudioMode:true, viewMode:'solo',
});
assert.deepEqual(mobile[0],['stream5','stream6','stream7']);
const android = evaluate({
  previouslyMounted:list.slice(0,8), channels:list, visibleChannels:['stream7'],
  mobileWarmPlaybackChannels:['stream5','stream6'], isDesktopGrid:false,
  iosSingleAudioMode:false, viewMode:'solo',
});
assert.deepEqual(android[0],['stream7']);
console.log('PASS: iOS history remains bounded; Android does not inherit iOS-only warm cache');

// The existing TwitchPlayer prop remains unchanged, so warm members above are
// still rendered offscreen and muted exactly as before. This stage does not
// alter playback scheduling or audio ownership.
assert.match(app, /keepPlaybackWarm=\{[\s\S]*?iosSingleAudioMode[\s\S]*?mobileWarmPlaybackChannels\.has\(channel\)[\s\S]*?isDesktopGrid && viewMode === 'solo'[\s\S]*?desktopChannels\.includes\(channel\)/);
assert.match(app, /allowBackgroundAudio=\{false\}/);
console.log('PASS: Existing Focus/iOS warm policy and audio policy remain untouched');
console.log('PASS: Viewer Core A bounded mounting tests passed');
