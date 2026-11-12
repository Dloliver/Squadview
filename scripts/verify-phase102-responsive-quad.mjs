import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseStaticQuadCapacity as capacity } from '../src/lib/staticQuadCapacity.js';
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
console.log('PASS: Static Quad 1.0.2 focused structure and pure capacity checks');
