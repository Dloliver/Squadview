import { supabase } from '../lib/supabase';

const TWITCH_ACCOUNT_FUNCTION = 'twitch-account';
const LEGACY_PROVIDER_TOKEN_KEY = 'squadview:twitch-provider-token:v1';
const FOLLOWED_CHANNELS_CACHE_MS = 10 * 60 * 1000;

let followedChannelsCache = null;

function followingError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function clearLegacyProviderToken() {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    window.localStorage.removeItem(LEGACY_PROVIDER_TOKEN_KEY);
  } catch {
    // Legacy token cleanup is best effort only.
  }
}

clearLegacyProviderToken();

async function readFunctionError(error) {
  let payload = null;

  try {
    if (error?.context?.clone) {
      payload = await error.context.clone().json();
    }
  } catch {
    // Preserve the original Supabase Function error when no JSON body is available.
  }

  return followingError(
    payload?.code || 'twitch_following_failed',
    payload?.message || error?.message || 'Could not load your Twitch follows.',
    payload,
  );
}

async function currentSquadViewUserId() {
  if (!supabase) return '';

  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;
  return String(data?.session?.user?.id || '');
}

async function invokeFollowingAction(action) {
  if (!supabase) {
    throw followingError(
      'twitch_reconnect_required',
      'Sign in with Twitch to load the channels you follow.',
    );
  }

  const { data, error } = await supabase.functions.invoke(
    TWITCH_ACCOUNT_FUNCTION,
    {
      body: { action },
    },
  );

  if (error) throw await readFunctionError(error);

  if (!data?.ok) {
    throw followingError(
      data?.code || 'twitch_following_failed',
      data?.message || 'Could not load your Twitch follows.',
      data,
    );
  }

  return data;
}

export async function loadFollowedLiveStreams() {
  const result = await invokeFollowingAction('followed-live');
  return Array.isArray(result?.streams) ? result.streams : [];
}

export async function loadFollowedChannels({ force = false } = {}) {
  const userId = await currentSquadViewUserId();
  const now = Date.now();

  if (!userId) {
    followedChannelsCache = null;

    throw followingError(
      'twitch_reconnect_required',
      'Sign in with Twitch to load the channels you follow.',
    );
  }

  if (
    !force &&
    followedChannelsCache?.userId === userId &&
    now - followedChannelsCache.checkedAt < FOLLOWED_CHANNELS_CACHE_MS
  ) {
    return followedChannelsCache.data;
  }

  const result = await invokeFollowingAction('followed-channels');
  const channels = Array.isArray(result?.channels) ? result.channels : [];

  followedChannelsCache = {
    userId,
    checkedAt: now,
    data: channels,
  };

  return channels;
}

if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      followedChannelsCache = null;
      clearLegacyProviderToken();
    }
  });
}
