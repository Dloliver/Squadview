import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'src', 'App.jsx');
const cssPath = path.join(root, 'src', 'styles.css');
const accountPath = path.join(root, 'src', 'services', 'accountService.js');

for (const file of [appPath, cssPath, accountPath]) {
  if (!fs.existsSync(file)) {
    console.error(`FAIL: missing ${path.relative(root, file)}`);
    process.exit(1);
  }
}

const app = fs.readFileSync(appPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const account = fs.readFileSync(accountPath, 'utf8');

const checks = [
  ['wide desktop chat breakpoint exists', app.includes("window.matchMedia('(min-width: 1100px)')")],
  ['narrow Grid + Chat reserves the fourth tile', app.includes('narrowDesktopGridChat') && app.includes('className="desktop-chat-grid-tile"')],
  ['narrow Grid + Chat limits Twitch to three streams', app.includes("(narrowDesktopGridChat ? 3 : 4)")],
  ['YouTube + narrow chat reserves two Twitch slots', app.includes("(narrowDesktopGridChat ? 2 : 3)")],
  ['wide chat dock side preference exists', app.includes("squadview:chat-dock-side-v1")],
  ['chat dock control can move left or right', app.includes("← Dock left") && app.includes("Dock right →")],
  ['wide rail supports left-side grid placement', css.includes('.viewer-primary-layout.has-chat-rail.chat-dock-left') && css.includes('grid-template-areas: "chat stream"')],
  ['narrow chat tile is bottom-right', css.includes('.desktop-chat-grid-tile') && css.includes('grid-column: 2;') && css.includes('grid-row: 2;')],
  ['OAuth asks Supabase to return to the current browser URL', account.includes('const redirectUrl = new URL(window.location.href);') && account.includes('redirectTo,')],
];

let failures = 0;
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) failures += 1;
}

function chatPage(channels, pinned, slot, page, limit, rotation = []) {
  const others = rotation.filter((c) => c !== pinned && channels.includes(c));
  for (const c of channels) if (c !== pinned && !others.includes(c)) others.push(c);
  const perPage = Math.max(1, limit - 1);
  const pageOthers = others.slice(page * perPage, page * perPage + perPage);
  const result = [...pageOthers];
  result.splice(Math.min(slot, result.length), 0, pinned);
  return result.slice(0, limit);
}

const sample = ['one','two','three','four'];
const wide = chatPage(sample, 'two', 1, 0, 4, ['one','three','four']);
const narrow = chatPage(sample, 'two', 1, 0, 3, ['one','three','four']);
const narrow2 = chatPage(sample, 'two', 1, 1, 3, ['one','three','four']);
const modelOk = wide.length === 4
  && narrow.length === 3
  && narrow.includes('two')
  && narrow2.includes('two')
  && narrow2.includes('four');
console.log(`${modelOk ? 'PASS' : 'FAIL'}  responsive chat paging keeps the chat owner anchored`);
if (!modelOk) failures += 1;

if (failures) {
  console.error(`\n${failures} verification check(s) failed.`);
  process.exit(1);
}

console.log('\nSquadView UX Refresh Phase 1.1 verification passed.');
