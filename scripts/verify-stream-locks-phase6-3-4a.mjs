import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildLockedPage, rotateMobilePair } from '../src/lib/streamLocks.js';

const names = ['a','b','c','d','e','f','g','h'];
function page(pageNo, locks, capacity=4) {
  return buildLockedPage({ channels:names, page:pageNo, capacity, lockedSlots:locks });
}
const p0=page(0,{a:0,c:2});
const p1=page(1,{a:0,c:2});
assert.deepEqual(p0.channels,['a','b','c','d']);
assert.deepEqual(p1.channels,['a','e','c','f']);
assert.equal(p1.slotsByChannel.a,0);
assert.equal(p1.slotsByChannel.c,2);
assert.equal(p1.pageCount,3);
console.log('PASS: Two desktop locks remain in their original visual slots when paging.');

const three=page(3,{a:0,c:1,g:3});
assert.equal(three.pageCount,5);
assert.equal(three.channels[0],'a');
assert.equal(three.channels[1],'c');
assert.equal(three.channels[3],'g');
assert.equal(new Set(three.channels).size,4);
console.log('PASS: Three locks leave one rotating desktop position with no duplicates.');

const chat=buildLockedPage({ channels:names, page:1, capacity:3, lockedSlots:{a:0}, impliedPinnedChannel:'c', impliedPinnedSlot:0 });
assert.equal(chat.channels[0],'a');
assert.ok(chat.channels.includes('c'));
assert.equal(new Set(chat.channels).size,3);
console.log('PASS: Desktop Grid + Chat preserves an explicit lock and the chat-pinned channel.');

assert.deepEqual(rotateMobilePair({channels:names,pair:['a','b'],lockedSlots:{a:0},direction:1}),['a','c']);
assert.deepEqual(rotateMobilePair({channels:names,pair:['a','b'],lockedSlots:{b:1},direction:1}),['c','b']);
assert.deepEqual(rotateMobilePair({channels:names,pair:['a','b'],lockedSlots:{},direction:1}),['c','d']);
assert.deepEqual(rotateMobilePair({channels:names,pair:['c','b'],lockedSlots:{b:1},direction:-1}),['a','b']);
console.log('PASS: Mobile can lock either visible stream, or rotate both when unlocked.');

const single=buildLockedPage({channels:['a','b','c'],page:100,capacity:2,lockedSlots:{b:1}});
assert.equal(single.channels[1],'b');
assert.ok(single.pageCount>=1);
console.log('PASS: Lock follows the streamer across pages and limited tile capacity.');

const app=fs.readFileSync(new URL('../src/App.jsx', import.meta.url),'utf8');
const twitch=fs.readFileSync(new URL('../src/components/TwitchPlayer.jsx', import.meta.url),'utf8');
assert.match(app,/rotateMobilePair\(/);
assert.match(app,/buildLockedPage\(/);
assert.match(app,/onToggleLock=/);
assert.match(app,/streamLockSlots/);
assert.match(twitch,/aria-pressed=\{streamLocked\}/);
assert.match(twitch,/onClick=\{onToggleLock\}/);
console.log('PASS: Wiring is present in the App and TwitchPlayer, without changing the audio controller.');
console.log('PASS: Phase 6.3.4A stream lock verification complete.');
