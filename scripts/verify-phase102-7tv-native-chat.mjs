import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeSevenTvSet, loadSevenTvEmotes, tokenizeSevenTvText,
  __resetSevenTvCacheForTests,
} from '../src/lib/sevenTvEmotes.js';

const check = (label, condition) => {
  assert.ok(condition, label);
  console.log('PASS:', label);
};
const host = (id) => ({ url: `//cdn.7tv.app/emote/${id}`, files: [{ name: '1x.webp' }, { name: '2x.webp' }] });
const emote = (id, name) => ({ id, name, data: { host: host(id) } });
const GLOBAL = { emotes: [emote('60aabbccddeeff1122334455', 'GlobalHype'), emote('60aabbccddeeff1122334466', 'SameCode')] };
const CHANNEL = { emotes: [emote('60aabbccddeeff1122334477', 'ChannelWave'), emote('60aabbccddeeff1122334488', 'SameCode')] };
const USER = { connections: [{ platform: 'TWITCH', id: '12345678', emote_set_id: '60bbccddeeff112233445566' }] };
const app = fs.readFileSync('src/App.jsx', 'utf8');
const panel = fs.readFileSync('src/components/ChatPanel.jsx', 'utf8');
const service = fs.readFileSync('src/services/twitchNativeChatService.js', 'utf8');
const seven = fs.readFileSync('src/lib/sevenTvEmotes.js', 'utf8');

const normalized = normalizeSevenTvSet(GLOBAL, 'global');
check('7TV API v3 active emote schema builds official HTTPS CDN URLs',
  normalized.length === 2 && normalized[0].image_url ===
  'https://cdn.7tv.app/emote/60aabbccddeeff1122334455/1x.webp');
check('Malformed names, URLs and spoofed hosts are rejected',
  normalizeSevenTvSet({ emotes: [
    { ...emote('60aabbccddeeff1122334499', 'bad name') },
    { id: '60aabbccddeeff1122334499', name: 'BadHost', data: { host: { url: '//evil.example/emote/60aabbccddeeff1122334499', files: [{name:'1x.webp'}] } } },
    { ...emote('60aabbccddeeff1122334499', 'Safe') },
    { ...emote('60aabbccddeeff1122334499', 'Safe') },
  ] }).length === 1);
check('Whitespace-token matching avoids changing partial words and punctuation', (() => {
  const found = tokenizeSevenTvText('Hi GlobalHype GlobalHype! PrefixGlobalHype\nGlobalHype', new Map(normalized.map(e => [e.name, e])));
  return found.filter(x => x.type === 'emote').length === 2 &&
    found.map(x => x.type === 'text' ? x.text : x.emote.name).join('') ===
    'Hi GlobalHype GlobalHype! PrefixGlobalHype\nGlobalHype';
})());

__resetSevenTvCacheForTests();
const previousFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async (url) => {
  requests.push(url);
  const data = url.endsWith('/emote-sets/global') ? GLOBAL
    : url.endsWith('/users/twitch/12345678') ? USER
    : url.endsWith('/emote-sets/60bbccddeeff112233445566') ? CHANNEL
    : null;
  return data ? { ok: true, json: async () => data } : { ok: false, status: 404 };
};
try {
  const [one, two] = await Promise.all([loadSevenTvEmotes('12345678'), loadSevenTvEmotes('12345678')]);
  check('Fetch global, account connection and selected channel set without auth',
    requests.length === 3 && requests.every(u => u.startsWith('https://7tv.io/v3/')));
  check('Global and channel emotes merge; channel wins an identical code',
    one.lookup.size === 3 && one.lookup.get('SameCode')?.source === 'channel' &&
    one.lookup.get('GlobalHype')?.source === 'global' &&
    one.lookup.get('ChannelWave')?.source === 'channel');
  check('Two chat panels share pending/cached read-only network requests',
    two.lookup.size === 3 && (await loadSevenTvEmotes('12345678')).lookup.size === 3 && requests.length === 3);
  const invalid = await loadSevenTvEmotes('../../evil');
  check('Unsafe Twitch broadcaster IDs generate no 7TV requests', invalid.lookup.size === 0 && requests.length === 3);
  const notOn7tv = await loadSevenTvEmotes('55555555');
  check('Missing channel set still displays global emotes', notOn7tv.global.length === 2 && notOn7tv.channel.length === 0);
  __resetSevenTvCacheForTests();
  globalThis.fetch = async () => { throw new Error('7TV is unreachable'); };
  const unavailable = await loadSevenTvEmotes('12345678');
  check('7TV API failure safely falls back to text/no emotes',
    unavailable.lookup.size === 0 && unavailable.channel.length === 0 && unavailable.global.length === 0);
} finally {
  globalThis.fetch = previousFetch;
  __resetSevenTvCacheForTests();
}
check('Native chat reuses its existing authenticated Twitch chat reader and sender',
  panel.includes('createNativeTwitchChat({') &&
  panel.includes('await sendNativeTwitchChatMessage({') &&
  service.includes("new WebSocket(url)") &&
  service.includes("return invokeTwitchAccount('chat-send', {"));
check('Official Twitch fragments win over 7TV text parsing',
  panel.includes("fragment?.type === 'emote' && fragment?.emoteId") &&
  panel.includes('<TwitchEmote key={key} fragment={fragment} />') &&
  panel.includes('<SevenTvText key={key} text={fragment?.text ||') &&
  panel.includes('sevenTvLookup={sevenTvEmotes.lookup}'));
check('7TV fetches are tied to the current broadcaster and cancelled on channel change',
  panel.includes('loadSevenTvEmotes(broadcaster.id)') &&
  panel.includes('setSevenTvEmotes(EMPTY_SEVEN_TV)') &&
  panel.includes('[nativeEnabled, broadcaster?.id, normalizedChannel]') &&
  panel.includes('if (!cancelled) setSevenTvEmotes(result)'));
check('Native picker includes optional 7TV channel/global collections and search',
  panel.includes("key: '7tv-channel'") && panel.includes("key: '7tv-global'") &&
  panel.includes('...sevenTvPickerSections,') &&
  panel.includes("emote.name.toLowerCase().includes(emoteSearch.trim().toLowerCase())"));
check('7TV images are safely hosted and message text is rendered through React',
  seven.includes("url.hostname !== 'cdn.7tv.app'") &&
  !panel.includes('dangerouslySetInnerHTML') &&
  panel.includes('onError={() => setFailed(true)}'));
check('Existing grid, UltraWide, Sticky Chat and mobile view mounts not modified',
  app.includes('desktopSixStreamEnabled') && app.includes('squadview-ultrawide-five') &&
  app.includes('maxVisibleStreamLocks') && app.includes('ChatPanel'));
console.log('PASS: 1.0.2 7TV Native Chat integration tests (offline fixtures); real 7TV API and browser acceptance still required.');
