import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src', 'components', 'TwitchPlayer.jsx'), 'utf8');

const checks = [
  ['desktop chat pinned slot state exists', app.includes('const [desktopChatPinnedSlot, setDesktopChatPinnedSlot] = useState(0);')],
  ['chat paging helper exists', app.includes('function getDesktopChatPageChannels(')],
  ['desktop chat click captures clicked tile', app.includes('const clickedSlot = Math.max(0, currentVisible.indexOf(cleaned));')],
  ['chat click does not force tile one', app.includes('setDesktopChatPinnedSlot(Math.min(clickedSlot, nextChatVisibleLimit - 1));')],
  ['chat page render preserves pinned slot', app.includes('desktopChatPinnedSlot,\n          desktopPageForRender,')],
  ['page navigation does not reset lead during chat', app.includes('if (!desktopGridChat) setDesktopLeadChannel(activeChannel);')],
  ['channel commit supports audio preservation', app.includes('preserveAudioMix = false,')],
  ['removal snapshots current audio levels', app.includes('if (preserveAudioMix) {\n      snapshotAudioLevels(audioPolicyRef.current);')],
  ['removal prunes only removed Listen channels', app.includes('[...listeningChannels].filter((channel) => unique.includes(channel))')],
  ['removal publishes preserved audio policy immediately', app.includes('audioPolicyRef.current = preservedAudioPolicy;')],
  ['removal resumes selected players', app.includes('resumeAudioSelectedPlayers(preservedAudioPolicy);')],
  ['remove flow requests audio preservation', app.includes('preserveAudioMix: true,')],
  ['chat border still follows chat owner', app.includes('? activeChatChannel === channel\n                        : activeChannel === channel')],
  ['TwitchPlayer remains audio-controller build', player.includes('final mute/volume\n  // is owned exclusively by App\'s viewer audio controller.')],
];

console.log('======================================================');
console.log(' SQUADVIEW CHAT PIN + REMOVE AUDIO VERIFICATION');
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
  console.log('Chat pin + remove audio verification PASSED.');
}
console.log('======================================================');
