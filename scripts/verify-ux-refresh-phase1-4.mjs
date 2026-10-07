import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');

const checks = [
  ['desktop Focus selector is compact and scrollable', css.includes('max-width: min(34vw, 470px);') && css.includes('max-width: 105px;') && css.includes('overscroll-behavior-x: contain;')],
  ['desktop Focus selector shifts away from right-side stream controls', css.includes('.focus-stream-selector {') && css.includes('left: 40%;') && css.includes('top: 8px;')],
  ['three-stream desktop chat uses the empty fourth quadrant', app.includes('const threeStreamDesktopChat = desktopGridChat && !youtubeVisible && channels.length === 3;') && app.includes('const desktopChatUsesGridTile = narrowDesktopGridChat || threeStreamDesktopChat;')],
  ['three-stream chat opening uses the same grid-tile capacity rule', app.includes('const threeStreamGridChat = !youtubeCompanion && channels.length === 3;') && app.includes('const chatUsesGridTile = !isWideDesktopChat || threeStreamGridChat;')],
  ['chat tile rendering follows the unified desktop grid-tile rule', app.includes('{desktopChatUsesGridTile && activeChatChannel && (') && app.includes("${desktopChatUsesGridTile ? 'has-chat-grid-tile' : ''}")],
  ['desktop chat grid tile styling remains available on wide screens', css.includes('@media (min-width: 761px) {') && css.includes('.viewer-primary-layout.has-chat-grid-tile .desktop-chat-grid-tile')],
  ['four-stream wide desktop can still use the side chat rail', app.includes("(viewMode === 'chat' && !desktopChatUsesGridTile)") && app.includes('const responsiveDesktopVisibleTwitchLimit = youtubeVisible') && app.includes('(narrowDesktopGridChat ? 3 : 4)')],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nSquadView UX Refresh Phase 1.4 verification failed.');
  process.exit(1);
}

console.log('\nSquadView UX Refresh Phase 1.4 verification passed.');
