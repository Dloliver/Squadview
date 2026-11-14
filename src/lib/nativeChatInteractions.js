// Pure Native Chat UI helpers. No Twitch API, storage, or player dependencies.
// A message ID is required for a real Twitch threaded reply.
export function nativeChatReplyTarget(message, channel) {
  const id = String(message?.id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const login = nativeChatLogin(message?.chatterLogin);
  const name = String(message?.chatterName || login || 'viewer').trim().slice(0, 50) || 'viewer';
  const preview = String(message?.text || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  return { id, channel: String(channel || '').trim().toLowerCase(), login, name, preview };
}

export function nativeChatLogin(value) {
  const login = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_]{1,25}$/.test(login) ? login : '';
}

export function nativeChatProfileTarget(message, channel) {
  const login = nativeChatLogin(message?.chatterLogin);
  if (!login) return null;
  const name = String(message?.chatterName || login).trim().slice(0, 50) || login;
  return { login, name, channel: String(channel || '').trim().toLowerCase() };
}

export function nativeChatProfileUrl(value) {
  const login = nativeChatLogin(value);
  return login ? `https://www.twitch.tv/${encodeURIComponent(login)}` : '';
}
