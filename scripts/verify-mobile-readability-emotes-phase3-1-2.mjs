import fs from 'node:fs';

const chat = fs.readFileSync('src/components/ChatPanel.jsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');

const checks = [
  ['native emote picker has an explicit close button', chat.includes('native-chat-emote-picker-close') && chat.includes('setEmotePickerOpen(false)')],
  ['emote close control is accessible', chat.includes('aria-label="Close Twitch emote picker"')],
  ['mobile focus selector text is larger', css.includes('.mobile-focus-stream-selector button {') && css.includes('font-size: 11px;')],
  ['mobile native chat text is enlarged', css.includes('.native-twitch-chat [role="log"]') && css.includes('font-size: 14px !important;')],
  ['mobile viewer footer is compact', css.includes('min-height: calc(36px + max(env(safe-area-inset-bottom), 4px));')],
  ['mobile Dual control uses a compact pill', css.includes('min-width: 92px;') && css.includes('border-radius: 999px;')],
  ['mobile emote picker has a larger close target', css.includes('.native-chat-emote-picker-close {') && css.includes('flex-basis: 34px;')],
];

let failed = false;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed = true;
}

if (failed) process.exit(1);
console.log('\nSquadView Phase 3.1.2 Mobile Readability + Emote Close verification passed.');
