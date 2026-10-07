import fs from 'node:fs';

const checks = [
  ['src/App.jsx', [
    'const [chatChannel, setChatChannel]',
    "viewMode === 'solo'",
    'function toggleChatForChannel(channel)',
    'setChatChannel(cleaned)',
    'desktopVisibleTwitchLimit = desktopGridChat',
    'activeChatChannel',
    'onChat={() => toggleChatForChannel(channel)}',
    "chatActive={viewMode === 'chat' && activeChatChannel === channel}",
    '<ChatPanel channel={activeChatChannel} />',
  ]],
  ['src/components/TwitchPlayer.jsx', [
    'focusActive = false',
    'onChat,',
    'chatActive = false',
    'className={`chat-chip ${chatActive',
    "{chatActive ? 'Chatting' : 'Chat'}",
    "{focusActive ? 'Focused' : 'Focus'}",
  ]],
  ['src/styles.css', [
    '.chat-chip {',
    '.chat-chip.is-chatting {',
  ]],
];

let failed = false;
for (const [file, markers] of checks) {
  const text = fs.readFileSync(file, 'utf8');
  const missing = markers.filter((marker) => !text.includes(marker));
  if (missing.length) {
    failed = true;
    console.log(`FAIL: ${file}`);
    missing.forEach((marker) => console.log(`  missing: ${marker}`));
  } else {
    console.log(`PASS: ${file}`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log('');
  console.log('Viewer Modes cleanup markers are installed.');
  console.log('No database migration is required.');
}
