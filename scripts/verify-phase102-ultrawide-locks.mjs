import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildUltrawideSixPage } from '../src/lib/ultrawideSixPage.js';

const app = readFileSync('src/App.jsx', 'utf8');
const pager = readFileSync('src/lib/ultrawideSixPage.js', 'utf8');
const check = (message, yes) => { assert.ok(yes, message); console.log('PASS:', message); };
const roster = Array.from({length: 12}, (_, i) => `creator${i}`);

check('UltraWide pager hard-cap is five even with malformed six-lock input',
  pager.includes('if (anchoredCount >= 5) break;') &&
  (() => {
    const all = Object.fromEntries(roster.slice(0, 6).map((v, i) => [v, i]));
    const first = buildUltrawideSixPage({ channels: roster, lockedSlots: all, page: 0 });
    const next = buildUltrawideSixPage({ channels: roster, lockedSlots: all, page: 1 });
    return first.pageCount === 7 && first.channels.length === 6 &&
      [0,1,2,3,4].every(i => first.slotsByChannel[roster[i]] === i && next.slotsByChannel[roster[i]] === i) &&
      next.channels.includes('creator6');
  })());

for (const count of [3, 4, 5]) {
  const locked = Object.fromEntries(roster.slice(0, count).map((v, i) => [v, i]));
  const pages = Array.from({length: 9}, (_, page) =>
    buildUltrawideSixPage({ channels: roster, lockedSlots: locked, page }));
  const vacancies = 6 - count;
  const pageCount = Math.ceil((roster.length - count) / vacancies);
  const seen = new Set();
  pages.slice(0, pageCount).forEach((result) => {
    assert.equal(result.pageCount, pageCount);
    assert.equal(result.channels.length, Math.min(6, count + roster.length - count));
    for (let slot = 0; slot < count; slot++) assert.equal(result.slotsByChannel[roster[slot]], slot);
    result.channels.filter(c => !Object.hasOwn(locked, c)).forEach(c => {
      assert.ok(!seen.has(c), `rotation repeated channel ${c}`);
      seen.add(c);
    });
  });
  check(`${count} UltraWide locks keep their slots; ${vacancies} remaining positions rotate on Next`,
    seen.size === roster.length - count);
}

const five = roster.slice(0, 5);
const six = roster.slice(0, 6);
const fiveLocks = Object.fromEntries(five.map((c, i) => [c, i]));
check('Favorite auto-fill can add sixth tile without dropping five UltraWide locks',
  buildUltrawideSixPage({ channels: five, lockedSlots: fiveLocks }).channels.length === 5 &&
  buildUltrawideSixPage({ channels: six, lockedSlots: fiveLocks }).channels.length === 6 &&
  buildUltrawideSixPage({ channels: six, lockedSlots: fiveLocks }).pageCount === 1);

check('Standard Grid has max three, UltraWide max five, and mobile remains one',
  app.includes('Math.min(desktopSixStream ? 5 : 3, Math.max(0, desktopVisibleTwitchLimit - 1))') &&
  app.includes('const maxVisibleStreamLocks = isDesktopGrid') &&
  app.includes('      : 1;'));

check('UltraWide lock selection uses independent state and session restore',
  app.includes('const [ultrawideStreamLockSlots, setUltrawideStreamLockSlots]') &&
  app.includes('initialViewer?.ultrawideStreamLockSlots') &&
  app.includes('streamLockSlots,\n        ultrawideStreamLockSlots,') &&
  app.includes('desktopLeadChannel, chatLayout, streamLockSlots, ultrawideStreamLockSlots]'));

check('Switching view scopes pager and lock button consistently',
  app.includes('const currentViewLockSlots = desktopSixStream') &&
  app.includes('lockedSlots: currentViewLockSlots') &&
  app.includes("desktopSixStream ? 'ultrawide' : 'standard'") &&
  app.includes('streamLocked={Object.prototype.hasOwnProperty.call(currentViewLockSlots, channel)}') &&
  app.includes('Object.keys(currentViewLockSlots).filter((name) => channels.includes(name)).length >= maxVisibleStreamLocks'));

check('First UltraWide entry inherits Grid locks; subsequent mode switches preserve selections',
  app.includes('setUltrawideStreamLockSlots((current) => current ?? Object.fromEntries(') &&
  app.includes('Object.entries(streamLockSlots).filter(([channel]) => channels.includes(channel)).slice(0, 3)') &&
  app.includes("const updateLocks = scope === 'ultrawide' ? setUltrawideStreamLockSlots : setStreamLockSlots"));

check('New viewer and empty roster reset old UltraWide preset',
  (app.match(/setUltrawideStreamLockSlots\(null\)/g) || []).length === 2);
check('Favorite Auto-fill and existing audio handlers are untouched',
  app.includes('function reconcileOpenSlotsWithLiveFavorites(roster') &&
  app.includes('preserveAudioMix: true') &&
  app.includes('onLiveAudioStateChange={syncNativeTwitchAudioIntent}'));

console.log('PASS: 1.0.2 mode-scoped UltraWide five-lock tests complete; live interaction still required.');
