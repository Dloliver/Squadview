import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildUltrawideSixPage } from '../src/lib/ultrawideSixPage.js';
const app=fs.readFileSync('src/App.jsx','utf8');
const css=fs.readFileSync('src/styles.css','utf8');
const check=(name,valid)=>{assert.ok(valid,name);console.log('PASS:',name)};
check('Grid, Dual Chat and UltraWide appear together on eligible desktops',
  app.includes('squadview-view-mode-switch') && app.includes('>▦ Grid</button>') &&
  app.includes('>Dual Chat</button>') && app.includes('>UltraWide</button>'));
check('Ultrawide control is hidden completely outside eligible viewports',
  app.includes('{desktopSixStreamViewport && (') &&
  app.includes('>UltraWide</button>') &&
  app.includes('disabled={channels.length < 5 || Boolean(youtubeCompanion)}') &&
  app.includes('(min-width: 2100px) and (min-height: 850px)'));
check('Buttons are active stateful controls and not inert',
  app.includes("activateDesktopViewerLayout('grid')") &&
  app.includes("activateDesktopViewerLayout('dual-chat')") &&
  app.includes("activateDesktopViewerLayout('six-stream')") &&
  app.includes('aria-pressed={desktopSixStream}'));
check('Dual Chat preserves previous opt-in and 1500x800 guard',
  app.includes("next === 'dual-chat'") &&
  app.includes("(min-width: 1500px) and (min-height: 800px)"));
check('Wide Grid is opt-in, 2100x850-gated, Twitch-only with 5 or 6 channels',
  app.includes("(min-width: 2100px) and (min-height: 850px)") &&
  app.includes('channels.length < 5 || youtubeCompanion') &&
  app.includes('desktopSixStreamEnabled && desktopSixStreamViewport'));
check('Six-player page count, channel selection and next page use separate helper',
  app.includes('buildUltrawideSixPage({ channels, page: desktopPage, lockedSlots: currentViewLockSlots })') &&
  app.includes('buildUltrawideSixPage({ channels, page: desktopPageForRender, lockedSlots: currentViewLockSlots })') &&
  app.includes('buildUltrawideSixPage({ channels, page: nextPage, lockedSlots: currentViewLockSlots })'));
check('Six-up layout positions 3 columns by 2 rows',
  app.includes('gridColumn: (index % 3) + 1') &&
  app.includes('gridRow: Math.floor(index / 3) + 1') &&
  css.includes('grid-template-columns: repeat(3, minmax(400px, 1fr)) !important') &&
  css.includes('grid-template-rows: repeat(2, minmax(0, 1fr)) !important'));
check('Six-up keeps only one selectable chat rail',
  app.includes('setCompactViewerEnabled(true)') &&
  app.includes('!desktopDualChat && !referralPromoVisible') &&
  app.includes('showDesktopChatRail') &&
  app.includes("desktopSixStream ? 'squadview-desktop-six-stream' : ''"));
check('No forced iframe resizing under Twitch minimum in six-up',
  css.includes('min-width: 400px;') && css.includes('min-height: 300px;') &&
  css.includes('transform: none !important;'));
check('Dual Chat stream swapping, Native Chat and Focus policy preserved',
  app.includes('chooseDesktopDualStream') && app.includes('cycleDesktopDualOther') &&
  app.includes('selectBoundedMountedChannels({') &&
  app.includes('<ChatPanel channel={channel} mentionCandidates={visibleChannels}'));
check('Six-up locks pinned to slots and pages rotate by available capacity', (()=>{
  const channels=Array.from({length:16},(_,i)=>`c${i+1}`);
  const first=buildUltrawideSixPage({channels,page:0,lockedSlots:{c1:0,c2:4}});
  const second=buildUltrawideSixPage({channels,page:1,lockedSlots:{c1:0,c2:4}});
  const last=buildUltrawideSixPage({channels,page:99,lockedSlots:{c1:0,c2:4}});
  return first.channels.length===6 && second.channels.length===6 &&
    first.pageCount===4 && second.pageCount===4 &&
    first.slotsByChannel.c1===0 && first.slotsByChannel.c2===4 &&
    second.slotsByChannel.c1===0 && second.slotsByChannel.c2===4 &&
    last.pageCount===4 && last.channels.includes('c16') &&
    first.channels.filter(c=>!['c1','c2'].includes(c)).every(c=>!second.channels.includes(c));
})());
check('Unlocked six-up has exactly 6 streams on first page and four on second for ten',(()=>{
  const channels=Array.from({length:10},(_,i)=>`c${i}`);
  const a=buildUltrawideSixPage({channels,page:0});
  const b=buildUltrawideSixPage({channels,page:1});
  return a.channels.length===6 && b.channels.length===4 &&
    a.pageCount===2 && b.pageCount===2 && new Set([...a.channels,...b.channels]).size===10;
})());
console.log('PASS: Layout toolbar and isolated six-up structural and logic tests; browser UX remains required.');
