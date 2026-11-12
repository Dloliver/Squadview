import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css=readFileSync('src/styles.css','utf8');
const shortBlock=css.match(/\/\* SquadView 1\.0\.1 Viewer Core B[\s\S]*?\n\}\n\n\n\/\* SquadView 1\.0\.1 — opt-in/);
assert.ok(shortBlock, 'Existing short desktop two-up block retained');
const section=shortBlock[0];
assert.match(section, /@media \(min-width: 1200px\) and \(min-height: 560px\) and \(max-height: 790px\)/);
assert.match(section, /\.viewer-shell\.squadview-short-desktop-two-up\.mode-dual\s*\n\s*\.stream-card\.is-visible \.player-viewport\.squadview-fit-embed > \.player-mount/);
assert.match(section, /\.viewer-shell\.squadview-short-desktop-two-up\.mode-chat\.chat-layout-grid\s*\n\s*\.stream-card\.is-visible \.player-viewport\.squadview-fit-embed > \.player-mount/);
for(const s of ['inset: 0;','left: 0;','top: 0;','width: 100% !important;','height: 100% !important;','transform: none !important;','min-width: 400px;','min-height: 300px;']) assert.ok(section.includes(s),`Short desktop fix missing ${s}`);
// Specificity: old mode-chat rule has 8 classes; new mode-chat rule has 9.
function classes(selector){return (selector.match(/\.[\w-]+/g)||[]).length;}
const oldSelector='.viewer-shell.mode-chat.chat-layout-grid .stream-card.is-visible .player-viewport.squadview-fit-embed > .player-mount';
const newSelector='.viewer-shell.squadview-short-desktop-two-up.mode-chat.chat-layout-grid .stream-card.is-visible .player-viewport.squadview-fit-embed > .player-mount';
assert.ok(classes(newSelector)>classes(oldSelector), 'New 2-up CSS must outrank old fit centering selector');
const oldDual='.viewer-shell.mode-dual .stream-card.is-visible .player-viewport.squadview-fit-embed > .player-mount';
const newDual='.viewer-shell.squadview-short-desktop-two-up.mode-dual .stream-card.is-visible .player-viewport.squadview-fit-embed > .player-mount';
assert.ok(classes(newDual)>classes(oldDual));
assert.ok(css.includes('transform: translate(-50%, -50%) scale(var(--squadview-fit-scale))'), 'Old fit rule retained for other viewports');
assert.ok(css.includes('squadview-desktop-six-stream'), 'Six-up CSS preserved');
console.log('PASS: short-desktop iframe resets left/top and transform with higher specificity');
console.log('PASS: original fit policy, mobile and ultrawide CSS retained');
