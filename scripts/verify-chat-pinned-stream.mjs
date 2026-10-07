import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'src', 'App.jsx');
const playerPath = path.join(root, 'src', 'components', 'TwitchPlayer.jsx');

const app = fs.readFileSync(appPath, 'utf8');
const player = fs.readFileSync(playerPath, 'utf8');

const checks = [
  ['Grid + Chat pins the active chat channel', app.includes("const desktopPinnedChannel = desktopGridChat\n      ? activeChatChannel\n      : desktopLeadChannel;")],
  ['desktop paging uses the pinned channel', app.includes('desktopPinnedChannel,\n      desktopPageForRender,\n      desktopVisibleTwitchLimit,')],
  ['chat target is resolved before desktop page channels', app.indexOf('const activeChatChannel =') < app.indexOf('const desktopChannels = getDesktopPageChannels(')],
  ['visual highlight is separated from audio active state', app.includes('highlightActive={\n                      desktopGridChat\n                        ? activeChatChannel === channel\n                        : activeChannel === channel')],
  ['audio active prop remains unchanged', app.includes('active={activeChannel === channel}')],
  ['desktop Chat still changes chat only', app.includes('// Desktop Chat owns chat selection and layout only.')],
  ['TwitchPlayer accepts independent highlight state', player.includes('highlightActive = active,')],
  ['TwitchPlayer border follows highlight state', player.includes("highlightActive\n          ? 'is-active'\n          : ''")],
  ['TwitchPlayer audio state still receives active separately', player.includes('active,\n  highlightActive = active,')],
  ['smart desktop Chat layout remains enabled', app.includes("const desktopGridChat = viewMode === 'chat' && isDesktopGrid && chatLayout === 'grid';")],
  ['desktop Chat still reduces visible Twitch slots', app.includes('const desktopVisibleTwitchLimit = desktopGridChat')],
  ['desktop paging controls remain available', app.includes('const nextDesktopPage = () => moveDesktopPage(1);')],
];

console.log('======================================================');
console.log(' SQUADVIEW CHAT PINNED STREAM VERIFICATION');
console.log('======================================================');
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}
console.log('------------------------------------------------------');
if (failed) {
  console.log(`Verification found ${failed} problem(s).`);
  process.exitCode = 1;
} else {
  console.log('Chat pinned stream verification PASSED.');
}
console.log('======================================================');
