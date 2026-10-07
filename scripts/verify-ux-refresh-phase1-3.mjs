import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');

const checks = [
  ['desktop Focus removes the legacy empty second column', css.includes('.viewer-shell.mode-solo .viewer-primary-layout.has-chat-rail .stream-stage.mode-solo .stream-stage-players') && css.includes('grid-template-columns: minmax(0, 1fr);')],
  ['desktop Focus player fills its available stage', css.includes('.viewer-shell.mode-solo .viewer-primary-layout.has-chat-rail .stream-stage.mode-solo .player-viewport') && css.includes('aspect-ratio: auto;')],
  ['mobile Focus keeps the selected channel as the chat target', app.includes('setChatChannel(cleaned);')],
  ['mobile Focus automatically exposes persistent chat', app.includes("viewMode === 'chat' || viewMode === 'solo' ? 'is-active' : 'is-parked'")],
  ['focused stream reports Chatting on mobile and desktop', app.includes("(viewMode === 'solo' && activeChannel === channel)")],
  ['mobile Focus has a direct stream selector', app.includes('className="mobile-focus-stream-selector"') && app.includes('className="mobile-focus-avatar"')],
  ['mobile Focus selector changes focus directly', app.includes("onClick={() => channel !== activeChannel && focusChannel(channel)}")],
  ['mobile Focus removes redundant bottom arrow pager', app.includes("channels.length > 2 && !mobileYoutubeDual && viewMode !== 'solo'") && app.includes("channels.length === 2 && viewMode === 'chat'")],
  ['mobile Focus gives remaining height to chat', css.includes('grid-template-rows: auto minmax(280px, 1fr);') && css.includes('.viewer-shell.mode-solo .persistent-mobile-chat.is-active')],
  ['Focus still enables the selected stream audio intent', /function focusChannel\(channel\)[\s\S]*?setAudioEnabled\(true\);[\s\S]*?mode: 'solo'/.test(app)],
  ['manual builder reveals inputs progressively', app.includes('const manualBuilderInputCount = useMemo(() => {') && app.includes('Math.max(1, lastFilledIndex + 2)')],
  ['manual builder renders only the visible progressive slots', app.includes('inputs.slice(0, manualBuilderInputCount).map((value, index) => (')],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nSquadView UX Refresh Phase 1.3 verification failed.');
  process.exit(1);
}

console.log('\nSquadView UX Refresh Phase 1.3 verification passed.');
