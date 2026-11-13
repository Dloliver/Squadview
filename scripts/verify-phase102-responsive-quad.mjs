import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseStaticQuadCapacity as capacity, supportsCompactSideQuad } from '../src/lib/staticQuadCapacity.js';
const cases = [
  ['regular desktop preserves 4', 1512, 717, 1512, true, 4],
  ['short desktop pages 2 without scroll', 1280, 500, 1280, true, 2],
  ['taller compact desktop keeps 4', 1100, 728, 1100, true, 4],
  ['portrait desktop 4 and chat below', 900, 1010, 900, true, 4],
  ['portrait desktop short 2 plus chat', 900, 700, 900, true, 2],
  ['narrow portrait 1 plus chat', 790, 900, 790, true, 1],
  ['full desktop with wider rail still 4', 1512, 717, 1512, false, 4],
  ['short desktop 2 with wider rail', 1200, 550, 1200, false, 2],
  ['too little height fails closed', 1100, 300, 1100, true, 1],
];
for (const [label, w, h, viewport, compact, result] of cases) {
  assert.equal(capacity({workspaceWidth:w,workspaceHeight:h,viewportWidth:viewport,compactChatRail:compact}),result,label);
  console.log('PASS:',label);
}
assert.equal(capacity({workspaceWidth:0,workspaceHeight:0,viewportWidth:1200}),1);
console.log('PASS: Invalid geometry fails closed');
// Actual user measurement from the installed 25-inch monitor window:
// viewport 1080x763, viewer workspace 1080x669, 4 selected Twitch streams.
const pwa = { workspaceWidth:1080, workspaceHeight:669, viewportWidth:1080, viewportHeight:763 };
assert.equal(supportsCompactSideQuad(pwa), true, '1080x763 PWA can fit native-size 2x2 with side chat');
assert.equal(capacity(pwa), 4, 'short portrait-monitor PWA keeps all four Twitch streams');
assert.equal(capacity({ ...pwa, compactChatRail:false }), 4, 'noncompact layout also keeps four');
assert.equal(supportsCompactSideQuad({ ...pwa, workspaceHeight:660 }), false,
  'no unscaled quad below 300px Twitch embed height');
assert.equal(capacity({ ...pwa, workspaceHeight:660 }), 2,
  'if too short for unscaled four, page two rather than clip embeds');
assert.equal(supportsCompactSideQuad({ ...pwa, workspaceWidth:900 }), false,
  'no four narrow Twitch embeds when side chat leaves insufficient width');
assert.equal(supportsCompactSideQuad({ ...pwa, viewportWidth:900, viewportHeight:1010 }), false,
  'tall portrait stays on original below-chat branch');
assert.equal(capacity({ workspaceWidth:900, workspaceHeight:1010,
  viewportWidth:900, viewportHeight:1100 }), 4,
  'tall portrait with space for below-chat still keeps four');
assert.equal(supportsCompactSideQuad({ ...pwa, viewportWidth:760 }), false,
  'no mobile layout changes');
assert.equal(supportsCompactSideQuad({ ...pwa, viewportWidth:2200 }), false,
  'no UltraWide layout changes');
console.log('PASS: measured 1080x763 PWA four-up, 400x300 safety, tall portrait/mobile/UltraWide isolation');
const app=readFileSync('src/App.jsx','utf8');
const css=readFileSync('src/styles.css','utf8');
const checks=[
 ['actual viewer workspace observed',app.includes("document.querySelector('.viewer-workspace')") && app.includes('new ResizeObserver(measure)')],
 ['four/two/one capacity gates',app.includes('quadSingleFallback') && app.includes('staticQuadCapacity === 2') && app.includes('chooseStaticQuadCapacity({')],
 ['static Grid class excluded from Dual Chat and 6 Streams',app.includes('quadGridRequested && !desktopDualChat && !desktopSixStream') && app.includes('squadview-static-quad-${staticQuadCapacity}')],
 ['chat tile never replaces fourth video',app.includes('desktopGridChat && !quadGridRequested && (')],
 ['same prior pagination and locks remain',app.includes('buildLockedPage') && app.includes('setDesktopPage(nextPage)')],
 ['static video grid never scrolls',css.includes('.viewer-shell.squadview-responsive-quad .viewer-workspace,') && css.includes('overflow: hidden !important;')],
 ['4 fixed tiles use 2x2 grid',css.includes('.squadview-static-quad-4') && css.includes('grid-template-rows: repeat(2, minmax(0, 1fr)) !important;')],
 ['2 fixed tiles use 2 columns and 1 row',css.includes('.squadview-static-quad-2') && css.includes('grid-template-rows: minmax(0, 1fr) !important;')],
 ['1 fixed tile fits narrow desktop',css.includes('.squadview-static-quad-1')],
 ['portrait chat is not overlaid',css.includes("grid-template-areas: 'stream' 'chat' !important")],
 ['Twitch embed unscaled',css.includes('transform: none !important;') && css.includes('min-height: 300px;')],
 ['Normal toolbar and other modes untouched',app.includes('desktopDualChat') && app.includes('desktopSixStream') && app.includes('activateDesktopViewerLayout')],
];
for(const [name,pass] of checks){assert.ok(pass,name);console.log('PASS:',name)}
assert.ok(app.includes('viewportHeight: window.innerHeight') &&
  app.includes('supportsCompactSideQuad({') && app.includes('squadview-compact-side-quad'),
  'compact desktop quad must use measured workspace and mode-scoped class');
assert.ok(css.includes("grid-template-areas: 'stream chat' !important") &&
  css.includes("grid-template-areas: 'chat stream' !important") &&
  css.includes('.viewer-shell.squadview-compact-side-quad'),
  'compact desktop chat can dock on either side, never overlay four streams');
assert.ok(css.includes('flex: 0 0 27px !important') &&
  css.includes('gap: 3px !important') &&
  css.includes('min-height: 300px !important') &&
  css.includes('transform: none !important'),
  'native Twitch size and header budget stay enforced');
console.log('PASS: short desktop four-up layout, side-chat CSS and native-iframe guards');
console.log('PASS: Static Quad 1.0.2 focused structure and pure capacity checks');
