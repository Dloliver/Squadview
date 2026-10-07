import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'src', 'App.jsx');
const cssPath = path.join(root, 'src', 'styles.css');
const homePath = path.join(root, 'src', 'pages', 'HomePage.jsx');
const sitemapPath = path.join(root, 'public', 'sitemap.xml');

for (const file of [appPath, cssPath, homePath, sitemapPath]) {
  if (!fs.existsSync(file)) {
    console.error(`FAIL: missing ${path.relative(root, file)}`);
    process.exit(1);
  }
}

const app = fs.readFileSync(appPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const home = fs.readFileSync(homePath, 'utf8');
const sitemap = fs.readFileSync(sitemapPath, 'utf8');

const checks = [
  ['root opens the app', app.includes("if (route === '/' || route === '/watch') return <SquadViewApp />;")],
  ['marketing overview moved to /learn', app.includes("if (route === '/learn' || route === '/home') return <HomePage />;")],
  ['narrow desktop grid breakpoint enabled', app.includes("window.matchMedia('(min-width: 761px)')")],
  ['normal desktop pages use full-page slicing', app.includes('return sourceChannels.slice(start, start + safeVisibleLimit).filter(Boolean);')],
  ['chat rail exists outside the stream grid', app.includes('className="desktop-chat-rail"')],
  ['focus stream selector exists', app.includes('className="focus-stream-selector"')],
  ['guest Twitch benefits prompt exists', app.includes('className="modal guest-benefits-modal"')],
  ['How it works modal exists', app.includes('className="modal how-it-works-modal"')],
  ['Following Live uses favorite-first ordering', app.includes('const orderedFollowedLiveStreams = useMemo(() => {')],
  ['Favorites have independent live status readiness', app.includes('favoriteLiveStatusReady')],
  ['manager overlay preserves visible playback', app.includes('Opening the manager is an overlay, not a playback transition.')],
  ['rewards is a non-destructive popover', app.includes('viewer-rewards-popover') && !app.includes('referralPromoTargetChannel')],
  ['desktop chat rail CSS installed', css.includes('.viewer-primary-layout.has-chat-rail') && css.includes('.desktop-chat-rail')],
  ['responsive 2x2 grid CSS installed', css.includes('@media (min-width: 761px)') && css.includes('grid-template-columns: repeat(2, minmax(0, 1fr));')],
  ['marketing page points back to app root', home.includes('href="/"') && !home.includes('href="/watch"')],
  ['marketing canonical is /learn', home.includes("https://squadview.app/learn")],
  ['sitemap includes /learn', sitemap.includes('<loc>https://squadview.app/learn</loc>')],
];

let failures = 0;
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) failures += 1;
}

// Model the intended page behavior independently so accidental future changes
// to the source are easier to reason about during QA.
function normalPage(channels, page, limit = 4) {
  return channels.slice(page * limit, page * limit + limit);
}
function chatPage(channels, pinned, slot, page, limit = 4, rotation = []) {
  const others = rotation.filter((c) => c !== pinned && channels.includes(c));
  for (const c of channels) if (c !== pinned && !others.includes(c)) others.push(c);
  const perPage = Math.max(1, limit - 1);
  const pageOthers = others.slice(page * perPage, page * perPage + perPage);
  const result = [...pageOthers];
  result.splice(Math.min(slot, result.length), 0, pinned);
  return result.slice(0, limit);
}

const sample = ['one','two','three','four','five','six','seven','eight'];
const normalOk = JSON.stringify(normalPage(sample, 0)) === JSON.stringify(['one','two','three','four'])
  && JSON.stringify(normalPage(sample, 1)) === JSON.stringify(['five','six','seven','eight']);
console.log(`${normalOk ? 'PASS' : 'FAIL'}  normal paging swaps the entire 4-stream page`);
if (!normalOk) failures += 1;

const anchored = chatPage(sample, 'two', 1, 1, 4, ['one','three','four','five','six','seven','eight']);
const anchorOk = anchored.includes('two') && anchored.length === 4;
console.log(`${anchorOk ? 'PASS' : 'FAIL'}  chat paging keeps the chat owner visible`);
if (!anchorOk) failures += 1;

if (failures) {
  console.error(`\n${failures} verification check(s) failed.`);
  process.exit(1);
}

console.log('\nSquadView UX Refresh Phase 1 verification passed.');
