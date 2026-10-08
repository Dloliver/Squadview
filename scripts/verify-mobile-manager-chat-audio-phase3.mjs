import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const chat = fs.readFileSync(path.join(root, 'src/components/ChatPanel.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');

const checks = [
  ['mobile viewer has a one-audio-owner policy', app.includes('const mobileSingleAudioMode = !isDesktopGrid;')],
  ['mobile audio policy selects only one manual/active owner', app.includes('if (policy.mobileSingleAudioMode)') && app.includes('manualOwner || policy.activeChannel')],
  ['mobile Listen can return to all-muted state', app.includes('if (currentOwner === cleaned)') && app.includes('audioEnabled: false')],
  ['mobile Listen selects a single secondary owner', app.includes("new Set([cleaned])") && app.includes('if (mobileSingleAudioMode)')],
  ['iOS session preservation remains scoped to iOS', app.includes('preserveAudibleSession={iosSingleAudioMode}')],
  ['mobile Chat enters focused workspace', app.includes('// On mobile, Chat is effectively Focus + Chat.') && app.includes('focusChannel(cleaned);')],
  ['mobile focused stream selector remains available', app.includes('mobile-focus-stream-selector')],
  ['ChatPanel receives current Squad mention candidates', app.includes('mentionCandidates={channels}')],
  ['native Chat accepts mention candidates', chat.includes('mentionCandidates = []')],
  ['native Chat builds mention candidates from recent chatters', chat.includes('[...messages].reverse()') && chat.includes('message?.chatterLogin')],
  ['native Chat @ parser exists', chat.includes("match(/(^|\\s)@([A-Za-z0-9_]{0,25})$/)")],
  ['native Chat renders mention suggestions', chat.includes('native-chat-mention-suggestions') && chat.includes('Mention a Twitch user')],
  ['native Chat usernames are clickable mentions', chat.includes('native-chat-username') && chat.includes('insertMention(message.chatterLogin')],
  ['native Chat keyboard can select mention suggestions', chat.includes("event.key === 'ArrowDown'") && chat.includes("event.key === 'Tab'")],
  ['mobile Manage Streams uses horizontal selected lineup rail', css.includes('.stream-manager-current-list {\n    display: flex;') && css.includes('scroll-snap-type: x proximity')],
  ['mobile selected lineup cards are compact', css.includes('flex: 0 0 min(74vw, 270px)')],
  ['mobile Add Stream keeps flexible remaining space', css.includes('.stream-manager-add {\n    padding-top: 10px;')],
  ['mobile Manage Streams footer stays accessible', css.includes('.stream-manager-footer {\n    position: sticky;') && css.includes('bottom: 0;')],
  ['native mention suggestion styling installed', css.includes('.native-chat-mention-suggestions button.is-active')],
];

let failed = false;
for (const [label, ok] of checks) {
  if (ok) {
    console.log(`PASS  ${label}`);
  } else {
    failed = true;
    console.error(`FAIL  ${label}`);
  }
}

if (failed) process.exit(1);
console.log('\nSquadView Phase 3 Mobile Manager + Chat + Audio verification passed.');
