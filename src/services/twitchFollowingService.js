import { supabase } from '../lib/supabase';

const TWITCH_PROVIDER_TOKEN_KEY = 'squadview:twitch-provider-token:v1';
const REQUIRED_SCOPE = 'user:read:follows';
const VALIDATION_MAX_AGE_MS = 55 * 60 * 1000;

let validationCache = null;

function storageAvailable() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function rememberProviderToken(session) {
  if (!storageAvailable() || !session?.provider_token) return;
  try {
    window.localStorage.setItem(TWITCH_PROVIDER_TOKEN_KEY, session.provider_token);
    validationCache = null;
  } catch {
    // Following Live can still work for the current callback when storage is restricted.
  }
}

function clearProviderToken() {
  validationCache = null;
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(TWITCH_PROVIDER_TOKEN_KEY);
  } catch {
    // No-op in restricted storage contexts.
  }
}

function readProviderToken() {
  if (!storageAvailable()) return '';
  try {
    return window.localStorage.getItem(TWITCH_PROVIDER_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function followingError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.provider_token) rememberProviderToken(session);
    if (event === 'SIGNED_OUT') clearProviderToken();
  });
}

async function validateProviderToken(token, force = false) {
  const now = Date.now();
  if (
    !force &&
    validationCache?.token === token &&
    now - validationCache.checkedAt < VALIDATION_MAX_AGE_MS
  ) {
    return validationCache.data;
  }

  const response = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (response.status === 401) {
    clearProviderToken();
    throw followingError('twitch_reconnect_required', 'Reconnect Twitch to refresh Following Live.');
  }
  if (!response.ok) {
    throw followingError('twitch_validation_failed', `Twitch authorization check failed with ${response.status}.`);
  }

  const data = await response.json();
  validationCache = { token, checkedAt: now, data };
  return data;
}

function normalizeThumbnail(value) {
  return String(value || '')
    .replace('{width}', '640')
    .replace('{height}', '360');
}

export async function loadFollowedLiveStreams() {
  const token = readProviderToken();
  if (!token) {
    throw followingError(
      'twitch_reconnect_required',
      'Reconnect Twitch once to let SquadView read the channels you follow.',
    );
  }

  const validation = await validateProviderToken(token);
  const scopes = Array.isArray(validation?.scopes) ? validation.scopes : [];
  if (!scopes.includes(REQUIRED_SCOPE)) {
    throw followingError(
      'twitch_scope_required',
      'Reconnect Twitch once to enable Following Live.',
    );
  }
  if (!validation?.user_id || !validation?.client_id) {
    throw followingError(
      'twitch_validation_failed',
      'Twitch did not return the user information needed for Following Live.',
    );
  }

  const streams = [];
  let cursor = '';

  for (let page = 0; page < 3; page += 1) {
    const url = new URL('https://api.twitch.tv/helix/streams/followed');
    url.searchParams.set('user_id', validation.user_id);
    url.searchParams.set('first', '100');
    if (cursor) url.searchParams.set('after', cursor);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Id': validation.client_id,
        Accept: 'application/json',
      },
    });

    if (response.status === 401) {
      clearProviderToken();
      throw followingError('twitch_reconnect_required', 'Reconnect Twitch to refresh Following Live.');
    }
    if (!response.ok) {
      throw followingError('twitch_following_failed', `Following Live request failed with ${response.status}.`);
    }

    const result = await response.json();
    const pageStreams = Array.isArray(result?.data) ? result.data : [];
    streams.push(...pageStreams);
    cursor = result?.pagination?.cursor || '';
    if (!cursor) break;
  }

  return streams
    .map((stream) => ({
      id: String(stream?.id || ''),
      user_id: String(stream?.user_id || ''),
      user_login: String(stream?.user_login || '').toLowerCase(),
      user_name: String(stream?.user_name || stream?.user_login || ''),
      game_name: String(stream?.game_name || ''),
      title: String(stream?.title || ''),
      viewer_count: Number(stream?.viewer_count || 0),
      thumbnail_url: normalizeThumbnail(stream?.thumbnail_url),
      started_at: String(stream?.started_at || ''),
    }))
    .filter((stream) => stream.user_login);
}


const FOLLOWED_CHANNELS_CACHE_MS = 10 * 60 * 1000;
let followedChannelsCache = null;

export async function loadFollowedChannels({ force = false } = {}) {
  const now = Date.now();
  if (
    !force &&
    followedChannelsCache &&
    now - followedChannelsCache.checkedAt < FOLLOWED_CHANNELS_CACHE_MS
  ) {
    return followedChannelsCache.data;
  }

  const token = readProviderToken();
  if (!token) {
    throw followingError(
      'twitch_reconnect_required',
      'Reconnect Twitch once to let SquadView read the channels you follow.',
    );
  }

  const validation = await validateProviderToken(token);
  const scopes = Array.isArray(validation?.scopes) ? validation.scopes : [];
  if (!scopes.includes(REQUIRED_SCOPE)) {
    throw followingError(
      'twitch_scope_required',
      'Reconnect Twitch once to enable your followed-channel list.',
    );
  }
  if (!validation?.user_id || !validation?.client_id) {
    throw followingError(
      'twitch_validation_failed',
      'Twitch did not return the user information needed to load your follows.',
    );
  }

  const follows = [];
  let cursor = '';

  // Twitch returns up to 100 follows per request. The hard stop prevents a bad
  // cursor from creating an unbounded loop while still covering large follow lists.
  for (let page = 0; page < 20; page += 1) {
    const url = new URL('https://api.twitch.tv/helix/channels/followed');
    url.searchParams.set('user_id', validation.user_id);
    url.searchParams.set('first', '100');
    if (cursor) url.searchParams.set('after', cursor);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Id': validation.client_id,
        Accept: 'application/json',
      },
    });

    if (response.status === 401) {
      clearProviderToken();
      followedChannelsCache = null;
      throw followingError('twitch_reconnect_required', 'Reconnect Twitch to refresh your followed channels.');
    }
    if (!response.ok) {
      throw followingError('twitch_following_failed', `Followed channels request failed with ${response.status}.`);
    }

    const result = await response.json();
    const pageFollows = Array.isArray(result?.data) ? result.data : [];
    follows.push(...pageFollows);
    cursor = result?.pagination?.cursor || '';
    if (!cursor) break;
  }

  const normalized = follows
    .map((item) => ({
      broadcaster_id: String(item?.broadcaster_id || ''),
      broadcaster_login: String(item?.broadcaster_login || '').toLowerCase(),
      broadcaster_name: String(item?.broadcaster_name || item?.broadcaster_login || ''),
      followed_at: String(item?.followed_at || ''),
    }))
    .filter((item) => item.broadcaster_login);

  followedChannelsCache = {
    checkedAt: now,
    data: normalized,
  };

  return normalized;
}
