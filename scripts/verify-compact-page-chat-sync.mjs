import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chatForExplicitPageChange } from '../src/lib/chatSelectionPersistence.js';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const pass = (condition, label) => { assert.ok(condition, label); console.log(`PASS: ${label}`); };

const selected = 'jahtrig';
const twoUp = ['cozistreams', 'trustmeimron'];
pass(chatForExplicitPageChange(selected, twoUp) === 'cozistreams',
  'Two-up compact page never displays stale off-page jahtrig chat');
pass(chatForExplicitPageChange('trustmeimron', twoUp) === 'trustmeimron',
  'Explicitly selected visible chat remains selected');
pass(chatForExplicitPageChange('cozistreams', twoUp) === 'cozistreams',
  'Visible current chat remains selected');
pass(chatForExplicitPageChange('jahtrig', ['jahtrig','cozistreams']) === 'jahtrig',
  'Sticky selected chat remains selected when its stream is visible');
pass(chatForExplicitPageChange('jahtrig', []) === 'jahtrig',
  'Empty page preserves preference rather than inventing a channel');
pass(chatForExplicitPageChange('a', ['b','c']) === 'b',
  'Responsive grid shrink resolves selected chat to current displayed page');
pass(chatForExplicitPageChange('a', ['a','b','c','d']) === 'a',
  'Responsive grid grow retains on-page selected chat');

pass(app.includes('const activeChatChannel = requestedChatChannel;'),
  'Stored chat preference remains explicit and unchanged on rerenders');
pass(app.includes('const displayedChatChannel = compactPagedChat\n      ? chatForExplicitPageChange(activeChatChannel, desktopChannels)\n      : activeChatChannel;'),
  'Rendered compact chat resolves against actual page channel list');
pass(app.includes('const compactPagedChat = compactViewerEnabled && desktopGridChat && showDesktopChatRail;'),
  'Compact page guard remains desktop-only and layout-scoped');
pass(app.includes('aria-selected={displayedChatChannel === channel}') &&
  app.includes("className={displayedChatChannel === channel ? 'is-current' : ''}"),
  'Compact tabs show the chat actually on-screen');
pass(app.includes("<ChatPanel channel={viewMode === 'chat' ? displayedChatChannel : activeChannel}"),
  'Twitch iframe and Native Chat both receive the matching displayed channel');
pass(app.includes('desktopGridChat\n                        ? displayedChatChannel === channel') &&
  app.includes("(viewMode === 'chat' && displayedChatChannel === channel)"),
  'Video chat highlighting agrees with displayed chat');
pass(app.includes('if (compactPagedChat) {\n        const nextChat = chatForExplicitPageChange(requestedChatChannel, nextVisibleChannels);'),
  'Existing explicit Next/Previous chat selection remains intact');
pass(app.includes('const mobileVisibleChatChannel = mobileSplitChat && !dualChannels.includes(activeChatChannel)'),
  'Mobile chat target behavior stays untouched');
pass(app.includes('const desktopPinnedChannel = desktopGridChat\n      ? requestedChatChannel'),
  'Existing pinned stream and desktop rotation logic stays untouched');
console.log('PASS: Compact page chat synchronization tests complete. Browser acceptance still required.');
