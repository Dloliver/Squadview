import { supabase } from '../lib/supabase';

const TWITCH_ACCOUNT_FUNCTION = 'twitch-account';

let lastSyncedProviderToken = '';
let grantSyncPromise = null;

function connectionError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

async function readFunctionError(error, fallbackCode = 'twitch_connection_failed') {
  let payload = null;

  try {
    if (error?.context?.clone) {
      payload = await error.context.clone().json();
    }
  } catch {
    // Keep the original function error when the response body is unavailable.
  }

  return connectionError(
    payload?.code || fallbackCode,
    payload?.message || error?.message || 'SquadView could not update the Twitch connection.',
    payload,
  );
}

export async function syncTwitchConnectionFromSession(session, { force = false } = {}) {
  if (!supabase || !session?.user?.id || !session?.provider_token) return null;

  const providerToken = String(session.provider_token || '');
  const providerRefreshToken = String(session.provider_refresh_token || '');

  if (!providerToken) return null;

  if (!force && providerToken === lastSyncedProviderToken && grantSyncPromise) {
    return grantSyncPromise;
  }

  grantSyncPromise = (async () => {
    const { data, error } = await supabase.functions.invoke(TWITCH_ACCOUNT_FUNCTION, {
      body: {
        action: 'connect',
        provider_token: providerToken,
        provider_refresh_token: providerRefreshToken || null,
      },
    });

    if (error) throw await readFunctionError(error);

    if (!data?.ok) {
      throw connectionError(
        data?.code || 'twitch_connection_failed',
        data?.message || 'SquadView could not update the Twitch connection.',
        data,
      );
    }

    lastSyncedProviderToken = providerToken;
    return data;
  })();

  try {
    return await grantSyncPromise;
  } catch (error) {
    grantSyncPromise = null;
    throw error;
  }
}

export async function loadTwitchConnectionStatus() {
  if (!supabase) return null;

  const { data, error } = await supabase.functions.invoke(TWITCH_ACCOUNT_FUNCTION, {
    body: { action: 'status' },
  });

  if (error) throw await readFunctionError(error);
  return data || null;
}

export async function validateTwitchConnection() {
  if (!supabase) return null;

  const { data, error } = await supabase.functions.invoke(TWITCH_ACCOUNT_FUNCTION, {
    body: { action: 'validate' },
  });

  if (error) throw await readFunctionError(error);
  return data || null;
}
