// SquadView 1.0.2: public, read-only 7TV emotes for the existing Native Chat.
// Does not require 7TV OAuth or change Twitch sending/reader connections.
const BASE = 'https://7tv.io/v3';
const TTL = 5 * 60 * 1000;
const FAILURE_TTL = 60 * 1000;
const cache = new Map();

export const EMPTY_SEVEN_TV = Object.freeze({ channel: [], global: [], lookup: new Map() });

function safeHost(host) {
  const raw = String(host?.url || '');
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    // Do not allow third-party JSON to inject arbitrary remote images.
    if (url.protocol !== 'https:' || url.hostname !== 'cdn.7tv.app' || url.port ||
        !/^\/emote\/[a-zA-Z0-9_-]{8,80}\/?$/.test(url.pathname)) return '';
    return url.origin + url.pathname.replace(/\/$/, '');
  } catch { return ''; }
}

export function normalizeSevenTvSet(payload, source = 'global') {
  const items = Array.isArray(payload?.emotes) ? payload.emotes : [];
  const result = [];
  const seen = new Set();
  for (const entry of items.slice(0, 1500)) {
    const name = String(entry?.name || '').trim();
    const rawId = String(entry?.id || entry?.data?.id || '').trim();
    if (!name || name.length > 80 || /\s/.test(name) || !/^[a-zA-Z0-9_-]{8,80}$/.test(rawId) || seen.has(name)) continue;
    const host = entry?.data?.host || entry?.host;
    const base = safeHost(host);
    const files = Array.isArray(host?.files) ? host.files : [];
    const file = files.find(f => f?.name === '1x.webp') ||
      files.find(f => f?.name === '2x.webp') ||
      files.find(f => /^1x\.(?:png|gif|avif)$/i.test(f?.name || ''));
    if (!base || !file || !/^[12]x\.(?:webp|png|gif|avif)$/i.test(file.name)) continue;
    seen.add(name);
    result.push({
      id: `7tv:${rawId}`,
      name,
      image_url: `${base}/${file.name}`,
      provider: '7tv',
      source,
    });
  }
  return result;
}

async function getJson(path) {
  const now = Date.now();
  const stored = cache.get(path);
  if (stored?.pending) return stored.pending;
  if (stored && now - stored.savedAt < (stored.value ? TTL : FAILURE_TTL)) return stored.value;

  const promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`${BASE}${path}`, {
        headers: { Accept: 'application/json' },
        mode: 'cors',
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })();
  cache.set(path, { pending: promise });
  const value = await promise;
  cache.set(path, { value, savedAt: Date.now() });
  while (cache.size > 40) cache.delete(cache.keys().next().value);
  return value;
}

function channelSetId(user, broadcasterId) {
  const connections = Array.isArray(user?.connections) ? user.connections : [];
  const direct = connections.find(c =>
    String(c?.platform || '').toUpperCase() === 'TWITCH' &&
    String(c?.id || '') === broadcasterId,
  );
  const id = direct?.emote_set_id || user?.emote_set?.id ||
    (Array.isArray(user?.emote_sets) && user.emote_sets.length === 1 ? user.emote_sets[0]?.id : '');
  return /^[a-zA-Z0-9_-]{8,80}$/.test(String(id || '')) ? String(id) : '';
}

export async function loadSevenTvEmotes(broadcasterUserId) {
  const id = String(broadcasterUserId || '').trim();
  // Numeric Twitch user ID comes from the existing native chat reader.
  if (!/^\d{1,24}$/.test(id)) return EMPTY_SEVEN_TV;
  const [globalJson, user] = await Promise.all([
    getJson('/emote-sets/global'),
    getJson(`/users/twitch/${id}`),
  ]);
  const setId = channelSetId(user, id);
  const channelJson = setId
    ? user?.emote_set?.id === setId && Array.isArray(user?.emote_set?.emotes)
      ? user.emote_set
      : await getJson(`/emote-sets/${setId}`)
    : null;
  const global = normalizeSevenTvSet(globalJson, 'global');
  const channel = normalizeSevenTvSet(channelJson, 'channel');
  const lookup = new Map(global.map(emote => [emote.name, emote]));
  channel.forEach(emote => lookup.set(emote.name, emote));
  return { global, channel, lookup };
}

export function tokenizeSevenTvText(text, lookup) {
  const value = String(text || '');
  if (!lookup?.size) return [{ type: 'text', text: value }];
  return value.split(/(\s+)/u).map(token => {
    const emote = lookup.get(token);
    return emote ? { type: 'emote', emote } : { type: 'text', text: token };
  });
}

export function __resetSevenTvCacheForTests() { cache.clear(); }
