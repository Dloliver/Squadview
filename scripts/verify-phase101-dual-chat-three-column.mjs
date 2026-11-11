import fs from 'node:fs';
import assert from 'node:assert/strict';
import { selectDesktopDualSwap, rotateDesktopDualOther } from '../src/lib/desktopDualChatSwap.js';
const app = fs.readFileSync('src/App.jsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
const pass = (label, cond) => { assert.ok(cond, label); console.log('PASS:', label); };
pass('Dual-chat remains opt-in and desktop-only',
  app.includes('desktopDualChatEnabled && desktopDualChatViewport') &&
  app.includes("(min-width: 1500px) and (min-height: 800px)"));
pass('Normal desktop videos use the center column, two rows',
  app.includes('return { gridColumn: 2, gridRow: index + 1, chatCovered: false };'));
pass('Chat A and B occupy full-height outer wings',
  app.includes("{ gridColumn: index === 0 ? 1 : 3, gridRow: '1 / span 2' }") &&
  css.includes('grid-row: 1 / span 2;') && css.includes('align-self: stretch;'));
pass('Three-column sizing leaves a >=400px center track',
  css.includes('clamp(290px, 20vw, 330px) minmax(400px, 1fr) clamp(290px, 20vw, 330px)'));
pass('Two center video rows and fullscreen chat wings have no overlap',
  css.includes('grid-template-rows: repeat(2, minmax(0, 1fr)) !important;') &&
  css.includes('grid-row: 1 / span 2;'));
pass('Original two independent ChatPanel instances remain paired by channel',
  app.includes('desktopDualChat && visibleChannels.map((channel, index) => (') &&
  app.includes('key={`dual-chat-${channel}`}') &&
  app.includes('<ChatPanel channel={channel} mentionCandidates={visibleChannels}'));
pass('Stream 2 controls and stream 1 selector remain',
  app.includes('squadview-dual-chat-swapbar') &&
  app.includes('chooseDesktopDualStream') &&
  app.includes('cycleDesktopDualOther'));
pass('Existing ultrawide layout remains unchanged at >=2100px',
  app.includes('desktopDualChatWideViewport') &&
  app.includes('gridColumn: index * 2 + 1') &&
  app.includes('gridColumn: index * 2 + 2') &&
  css.includes('@media (min-width: 2100px) and (min-height: 800px)'));
pass('Player sizing safety retained and iframe remains unscaled',
  css.includes('min-width: 400px;') && css.includes('min-height: 300px;') &&
  css.includes('transform: none !important;'));
pass('Phase A bounded mount and Phase B short-desktop rules intact',
  app.includes('selectBoundedMountedChannels({') &&
  app.includes('const shortDesktopTwoUp =') &&
  css.includes('squadview-short-desktop-two-up'));
const roster = ['sponge','aok','uncle','drinks','val'];
const pick = selectDesktopDualSwap({channels:roster,lead:'sponge',other:'aok',selected:'drinks',slot:'other'});
pass('Existing Phase2 swap logic still replaces only requested second stream',pick?.lead === 'sponge' && pick?.other === 'drinks');
pass('Existing Phase2 rotation wraps without changing first stream',rotateDesktopDualOther({channels:roster,lead:'sponge',other:'val',direction:1})==='aok');
pass('Existing Phase2 swap guard rejects unknown channels',selectDesktopDualSwap({channels:roster,lead:'sponge',other:'aok',selected:'unknown',slot:'other'})===null);
pass('No new autoplay or recovery wiring in Phase 3',
  !app.includes('startThreeColumnRecovery') && !css.includes('squadview-dual-three-iframe-overlay'));
console.log('PASS: Three-column dual chat structural checks. Browser geometry/chat/playback still required.');
