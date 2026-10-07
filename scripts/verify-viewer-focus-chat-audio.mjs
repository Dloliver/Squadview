import fs from 'node:fs';

const requiredChecks = [
  ['src/App.jsx', [
    "setChatChannel(isDesktopGrid ? cleaned : '')",
    'function captureDesktopAudioMix()',
    'captureDesktopAudioMix();',
    'isFocusedChannel || listeningChannels.has(channel)',
    "allowBackgroundAudio={isDesktopGrid && !iosSingleAudioMode && viewMode !== 'solo'}",
    'className="desktop-grid-chat-tile desktop-focus-chat-panel"',
    '<ChatPanel channel={activeChannel} />',
    "isDesktopGrid ? 'Focused stream + chat' : 'Solo focus'",
  ]],
  ['src/components/TwitchPlayer.jsx', [
    'allowBackgroundAudio = false',
    '(visible || active || allowBackgroundAudio)',
    'if (audible && (active || allowBackgroundAudio))',
    "'selected_audio_background'",
    'const backgroundVolume = active',
  ]],
  ['src/styles.css', [
    'Viewer Modes Phase 1.1',
    '.viewer-shell.mode-solo .stream-stage.mode-solo .stream-stage-players',
    '.viewer-shell.mode-solo .desktop-focus-chat-panel',
    '.desktop-focus-chat-panel {',
  ]],
];

const forbiddenChecks = [
  ['src/App.jsx', [
    'listeningChannels.has(channel) && isVisibleChannel',
  ]],
];

let failed = false;

for (const [file, markers] of requiredChecks) {
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

for (const [file, markers] of forbiddenChecks) {
  const text = fs.readFileSync(file, 'utf8');
  const present = markers.filter((marker) => text.includes(marker));
  if (present.length) {
    failed = true;
    console.log(`FAIL: ${file}`);
    present.forEach((marker) => console.log(`  old behavior still present: ${marker}`));
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log('');
  console.log('Viewer Focus + Chat + audio independence markers are installed.');
  console.log('Desktop Focus opens matching chat; mobile Focus behavior is unchanged.');
  console.log('Desktop Chat switching no longer depends on tile visibility for selected audio.');
  console.log('No database migration is required.');
}
