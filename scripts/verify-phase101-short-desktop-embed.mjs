
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLockedPage } from '../src/lib/streamLocks.js';

const app = readFileSync('src/App.jsx', 'utf8');
const css = readFileSync('src/styles.css', 'utf8');
const media = '(min-width: 1200px) and (min-height: 560px) and (max-height: 790px)';
const checks = [
  ['responsive viewport state', app.includes('shortDesktopTwoUpViewport') && app.includes(`window.matchMedia('${media}')`)],
  ['Twitch-only short desktop eligibility', app.includes("!youtubeVisible && (viewMode === 'dual' || desktopGridChat)")],
  ['chat tile falls back to existing side rail', app.includes('const desktopChatUsesGridTile = !shortDesktopTwoUp &&')],
  ['two streams per desktop page', app.includes('const desktopVisibleTwitchLimit = shortDesktopTwoUp\n      ? 2')],
  ['responsive class attached to viewer', app.includes("shortDesktopTwoUp ? 'squadview-short-desktop-two-up' : ''")],
  ['short-screen CSS matches same viewport', css.includes('@media '+media)],
  ['only two grid columns', css.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important')],
  ['only one grid row', css.includes('grid-template-rows: minmax(0, 1fr) !important')],
  ['single-stream case fills column', css.includes('.viewer-shell.squadview-short-desktop-one')],
  ['native 400x300 minimum retained', css.includes('min-width: 400px;\n    min-height: 300px;')],
  ['scaled embedding disabled for two-up only', css.includes('transform: none !important;') && css.includes('.viewer-shell.squadview-short-desktop-two-up')],
  ['existing viewport-fit rule retained', css.includes('SquadView Phase 6.3.4A.2')],
];
for (const [label, passed] of checks) {
  assert.ok(passed, label);
  console.log('PASS:', label);
}
const roster = ['lead','two','three','four','five'];
const opts = {channels: roster, capacity: 2, lockedSlots: {lead: 0}, rotationOrder: roster};
const first = buildLockedPage({...opts, page:0});
const second = buildLockedPage({...opts, page:1});
assert.deepEqual(first.channels, ['lead','two']);
assert.deepEqual(second.channels, ['lead','three']);
assert.equal(first.pageCount,4);
console.log('PASS: locked lead stays pinned and other streams rotate across 2-up pages');
const nonLocked = buildLockedPage({channels: roster, capacity: 2, lockedSlots:{}, page:1});
assert.deepEqual(nonLocked.channels,['three','four']);
console.log('PASS: unlocked roster pages exactly two');
console.log('PASS: short desktop Twitch layout structural checks complete');
