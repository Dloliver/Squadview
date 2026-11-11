import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const helper = fs.readFileSync(path.join(root, 'src/lib/nativeChatSendAvailability.js'), 'utf8');
const { canSendNativeChatMessage } = await import(`data:text/javascript;base64,${Buffer.from(helper).toString('base64')}`);
const panel = fs.readFileSync(path.join(root, 'src/components/ChatPanel.jsx'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/services/twitchNativeChatService.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'supabase/functions/twitch-account/index.ts'), 'utf8');
const check = (label, result) => { assert.ok(result, label); console.log(`PASS: ${label}`); };
const permit = (readerAuthorized, broadcasterUserId, sendBusy = false, readerStatus = 'ready') =>
  // An irrelevant readerStatus argument intentionally demonstrates independence.
  canSendNativeChatMessage({ readerAuthorized, broadcasterUserId, sendBusy, readerStatus });

check('authorized sender can compose while reader is ready', permit(true, '123456', false, 'ready'));
for (const state of ['preparing','connecting','subscribing','reconnecting','error']) {
  check(`authorized sender can compose during reader state ${state}`, permit(true,'123456',false,state));
}
check('signed-out viewer cannot send', !permit(false,'123456'));
check('unknown auth state cannot send', !permit(null,'123456'));
check('missing broadcaster cannot send', !permit(true,''));
check('malformed channel ID cannot send', !permit(true,'channel-name'));
check('pending send prevents duplicate submit', !permit(true,'123456',true));
check('composer uses the independent capability gate',
  panel.includes('const canComposeNativeChat = canSendNativeChatMessage({') &&
  panel.includes('readerAuthorized,') && panel.includes('broadcasterUserId: broadcaster?.id,') &&
  panel.includes('sendBusy,'));
check('native textarea is enabled by send capability, not reader readiness',
  panel.includes('disabled={!canComposeNativeChat}') &&
  !panel.includes("disabled={!broadcaster?.id || sendBusy || status !== 'ready'}"));
check('emote picker obeys sender authorization',
  panel.includes('aria-label="Open Twitch emote picker"') &&
  /aria-label="Open Twitch emote picker"[\s\S]{0,150}disabled=\{!canComposeNativeChat\}/.test(panel));
check('form submit respects sender capability and preserves failed drafts',
  panel.includes('if (!message || !canComposeNativeChat) return;') &&
  panel.includes('await sendNativeTwitchChatMessage({') &&
  panel.includes("setSendError(nextError?.message || 'Twitch could not send that message.');") &&
  panel.includes("setDraft('');"));
check('reader status ready clears a previous reader error',
  panel.includes("if (nextStatus === 'ready') setError('');"));
check('channel ID is exposed as soon as EventSub starts connecting',
  service.includes("emitStatus(mode === 'handoff' ? 'reconnecting' : 'connecting', { broadcaster });"));
check('existing EventSub message reader is retained',
  service.includes("new WebSocket(url)") && service.includes("'channel.chat.message'") && panel.includes('createNativeTwitchChat({'));
check('send still goes through existing authenticated backend',
  service.includes("return invokeTwitchAccount('chat-send', {") &&
  server.includes("if (action === 'chat-send')") &&
  server.includes("'https://api.twitch.tv/helix/chat/messages'"));
check('no optimistic message clear before Twitch accepts',
  panel.indexOf('await sendNativeTwitchChatMessage({') < panel.indexOf("setDraft('');", panel.indexOf('await sendNativeTwitchChatMessage({')));
console.log('PASS: Native chat send/reader separation checks complete.');
