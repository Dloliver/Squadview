import { createClient, type User } from 'npm:@supabase/supabase-js@2';

const REQUIRED_SCOPES = [
  'user:read:follows',
  'user:read:chat',
  'user:write:chat',
];

const TOKEN_TABLE = 'squadview_twitch_connections';
const VALIDATION_MAX_AGE_MS = 55 * 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

type ConnectionRow = {
  user_id: string;
  twitch_user_id: string;
  twitch_login: string | null;
  twitch_client_id: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  scopes: string[];
  access_token_expires_at: string | null;
  last_validated_at: string | null;
  reconnect_required: boolean;
  token_version: number;
  created_at: string;
  updated_at: string;
};

type TwitchValidation = {
  client_id?: string;
  login?: string;
  scopes?: string[];
  user_id?: string;
  expires_in?: number;
};

class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function requiredEnv(name: string) {
  const value = String(Deno.env.get(name) || '').trim();

  if (!value) {
    throw new ApiError(
      500,
      'twitch_server_not_configured',
      `Missing required Edge Function secret: ${name}.`,
    );
  }

  return value;
}

function readServiceKey() {
  const legacy = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  if (legacy) return legacy;

  const raw = String(Deno.env.get('SUPABASE_SECRET_KEYS') || '').trim();

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const first = Object.values(parsed || {}).find(
        (value) => typeof value === 'string' && value.trim(),
      );
      if (typeof first === 'string') return first.trim();
    } catch {
      // Fall through to the explicit setup error.
    }
  }

  throw new ApiError(
    500,
    'supabase_server_not_configured',
    'No Supabase server secret is available to the Edge Function.',
  );
}

function createAdminClient() {
  return createClient(requiredEnv('SUPABASE_URL'), readServiceKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function bearerToken(req: Request) {
  const header = String(req.headers.get('Authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw new ApiError(401, 'authentication_required', 'Sign in to SquadView first.');
  }

  return match[1];
}

async function authenticateUser(req: Request, admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin.auth.getUser(bearerToken(req));

  if (error || !data?.user?.id) {
    throw new ApiError(
      401,
      'authentication_required',
      'Your SquadView session is no longer valid.',
    );
  }

  return data.user;
}

function firstString(...values: unknown[]) {
  return values.find((value) => typeof value === 'string' && value.trim())?.toString().trim() || '';
}

function twitchIdentityUserId(user: User) {
  const identity = user.identities?.find((item) => item?.provider === 'twitch');
  const data = identity?.identity_data || {};

  return firstString(data.provider_id, data.sub, data.user_id);
}

function normalizeScopes(value: unknown) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((scope) => String(scope || '').trim())
      .filter(Boolean),
  )].sort();
}

function missingRequiredScopes(scopes: string[]) {
  return REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesFromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const raw = requiredEnv('TWITCH_TOKEN_ENCRYPTION_KEY');
  let bytes: Uint8Array;

  try {
    bytes = bytesFromBase64(raw);
  } catch {
    throw new ApiError(
      500,
      'twitch_encryption_key_invalid',
      'TWITCH_TOKEN_ENCRYPTION_KEY must be base64 encoded.',
    );
  }

  if (bytes.length !== 32) {
    throw new ApiError(
      500,
      'twitch_encryption_key_invalid',
      'TWITCH_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.',
    );
  }

  return crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptToken(value: string) {
  if (!value) return null;

  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return `v1:${base64FromBytes(iv)}:${base64FromBytes(new Uint8Array(encrypted))}`;
}

async function decryptToken(value: string | null) {
  if (!value) return '';

  const [version, iv64, cipher64] = String(value).split(':');

  if (version !== 'v1' || !iv64 || !cipher64) {
    throw new ApiError(
      500,
      'twitch_token_decryption_failed',
      'Stored Twitch token data is not in the expected encrypted format.',
    );
  }

  try {
    const key = await encryptionKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytesFromBase64(iv64) },
      key,
      bytesFromBase64(cipher64),
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    if (error instanceof ApiError) throw error;

    throw new ApiError(
      500,
      'twitch_token_decryption_failed',
      'SquadView could not decrypt the stored Twitch connection.',
    );
  }
}

async function validateTwitchToken(accessToken: string) {
  const response = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (response.status === 401) return null;

  if (!response.ok) {
    throw new ApiError(
      502,
      'twitch_validation_failed',
      `Twitch authorization validation failed with ${response.status}.`,
    );
  }

  return await response.json() as TwitchValidation;
}

function checkedValidation(validation: TwitchValidation, expectedTwitchUserId = '') {
  const twitchClientId = firstString(validation.client_id);
  const twitchUserId = firstString(validation.user_id);
  const twitchLogin = firstString(validation.login).toLowerCase();
  const scopes = normalizeScopes(validation.scopes);

  if (!twitchClientId || !twitchUserId) {
    throw new ApiError(
      502,
      'twitch_validation_failed',
      'Twitch did not return the user and client identity needed by SquadView.',
    );
  }

  if (twitchClientId !== requiredEnv('TWITCH_CLIENT_ID')) {
    throw new ApiError(
      409,
      'twitch_client_mismatch',
      'The Twitch token belongs to a different Twitch application than the one configured for SquadView.',
    );
  }

  if (expectedTwitchUserId && twitchUserId !== expectedTwitchUserId) {
    throw new ApiError(
      409,
      'twitch_identity_mismatch',
      'The connected Twitch token does not match this SquadView Twitch identity.',
    );
  }

  const missing = missingRequiredScopes(scopes);

  if (missing.length) {
    throw new ApiError(
      409,
      'twitch_scope_required',
      'Reconnect Twitch once to approve the permissions needed for Following Live and connected chat.',
      { missing_scopes: missing },
    );
  }

  return {
    twitchClientId,
    twitchUserId,
    twitchLogin,
    scopes,
    expiresIn: Number(validation.expires_in || 0),
  };
}

async function loadConnection(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const { data, error } = await admin
    .from(TOKEN_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, 'twitch_connection_read_failed', error.message);
  }

  return (data || null) as ConnectionRow | null;
}

async function markReconnectRequired(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  await admin
    .from(TOKEN_TABLE)
    .update({
      reconnect_required: true,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

function safeStatus(row: ConnectionRow | null) {
  if (!row) {
    return {
      ok: true,
      connected: false,
      reconnect_required: true,
      refresh_capable: false,
      scopes: [],
    };
  }

  return {
    ok: true,
    connected: !row.reconnect_required,
    twitch_user_id: row.twitch_user_id,
    twitch_login: row.twitch_login,
    scopes: normalizeScopes(row.scopes),
    access_token_expires_at: row.access_token_expires_at,
    last_validated_at: row.last_validated_at,
    reconnect_required: row.reconnect_required,
    refresh_capable: Boolean(row.refresh_token_ciphertext),
    token_version: row.token_version,
    updated_at: row.updated_at,
  };
}

async function saveConnectedGrant(
  admin: ReturnType<typeof createAdminClient>,
  user: User,
  providerToken: string,
  providerRefreshToken: string,
) {
  const validation = await validateTwitchToken(providerToken);

  if (!validation) {
    throw new ApiError(
      409,
      'twitch_reconnect_required',
      'Reconnect Twitch to create the secure SquadView Twitch connection.',
    );
  }

  const checked = checkedValidation(
    validation,
    twitchIdentityUserId(user) || '',
  );

  const existing = await loadConnection(admin, user.id);

  if (existing?.twitch_user_id && existing.twitch_user_id !== checked.twitchUserId) {
    throw new ApiError(
      409,
      'twitch_identity_mismatch',
      'This SquadView account is already connected to a different Twitch identity.',
    );
  }

  const now = new Date();
  const expiresAt = checked.expiresIn > 0
    ? new Date(now.getTime() + checked.expiresIn * 1000).toISOString()
    : null;

  const accessCiphertext = await encryptToken(providerToken);
  const refreshCiphertext = providerRefreshToken
    ? await encryptToken(providerRefreshToken)
    : existing?.refresh_token_ciphertext || null;

  const { data, error } = await admin
    .from(TOKEN_TABLE)
    .upsert({
      user_id: user.id,
      twitch_user_id: checked.twitchUserId,
      twitch_login: checked.twitchLogin || null,
      twitch_client_id: checked.twitchClientId,
      access_token_ciphertext: accessCiphertext,
      refresh_token_ciphertext: refreshCiphertext,
      scopes: checked.scopes,
      access_token_expires_at: expiresAt,
      last_validated_at: now.toISOString(),
      reconnect_required: false,
      token_version: Math.max(1, Number(existing?.token_version || 0) + 1),
      updated_at: now.toISOString(),
    }, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    throw new ApiError(500, 'twitch_connection_write_failed', error.message);
  }

  return data as ConnectionRow;
}

async function refreshConnection(
  admin: ReturnType<typeof createAdminClient>,
  row: ConnectionRow,
) {
  const refreshToken = await decryptToken(row.refresh_token_ciphertext);

  if (!refreshToken) {
    await markReconnectRequired(admin, row.user_id);

    throw new ApiError(
      409,
      'twitch_refresh_token_missing',
      'Reconnect Twitch once so SquadView can save a refreshable Twitch authorization.',
    );
  }

  const body = new URLSearchParams({
    client_id: requiredEnv('TWITCH_CLIENT_ID'),
    client_secret: requiredEnv('TWITCH_CLIENT_SECRET'),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const newer = await loadConnection(admin, row.user_id);

    if (newer && Number(newer.token_version) !== Number(row.token_version)) {
      return newer;
    }

    await markReconnectRequired(admin, row.user_id);

    throw new ApiError(
      409,
      'twitch_reconnect_required',
      'Twitch could not refresh this authorization. Reconnect Twitch once to continue.',
    );
  }

  const refreshed = await response.json();
  const newAccessToken = firstString(refreshed?.access_token);
  const newRefreshToken = firstString(refreshed?.refresh_token) || refreshToken;

  if (!newAccessToken) {
    throw new ApiError(
      502,
      'twitch_refresh_failed',
      'Twitch returned a refresh response without a new access token.',
    );
  }

  const validation = await validateTwitchToken(newAccessToken);

  if (!validation) {
    throw new ApiError(
      502,
      'twitch_refresh_failed',
      'Twitch returned a refreshed token that could not be validated.',
    );
  }

  const checked = checkedValidation(validation, row.twitch_user_id);
  const now = new Date();
  const expiresAt = checked.expiresIn > 0
    ? new Date(now.getTime() + checked.expiresIn * 1000).toISOString()
    : null;

  const { data, error } = await admin
    .from(TOKEN_TABLE)
    .update({
      twitch_login: checked.twitchLogin || row.twitch_login,
      twitch_client_id: checked.twitchClientId,
      access_token_ciphertext: await encryptToken(newAccessToken),
      refresh_token_ciphertext: await encryptToken(newRefreshToken),
      scopes: checked.scopes,
      access_token_expires_at: expiresAt,
      last_validated_at: now.toISOString(),
      reconnect_required: false,
      token_version: Number(row.token_version) + 1,
      updated_at: now.toISOString(),
    })
    .eq('user_id', row.user_id)
    .eq('token_version', row.token_version)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new ApiError(500, 'twitch_connection_write_failed', error.message);
  }

  if (data) return data as ConnectionRow;

  const winner = await loadConnection(admin, row.user_id);

  if (!winner) {
    throw new ApiError(
      409,
      'twitch_reconnect_required',
      'The Twitch connection changed while refreshing. Reconnect Twitch.',
    );
  }

  return winner;
}

async function validateStoredConnection(
  admin: ReturnType<typeof createAdminClient>,
  row: ConnectionRow,
  force = false,
) {
  if (row.reconnect_required) {
    throw new ApiError(
      409,
      'twitch_reconnect_required',
      'Reconnect Twitch once to restore this SquadView connection.',
    );
  }

  const lastValidated = row.last_validated_at
    ? new Date(row.last_validated_at).getTime()
    : 0;

  if (
    !force &&
    lastValidated > 0 &&
    Date.now() - lastValidated < VALIDATION_MAX_AGE_MS
  ) {
    return row;
  }

  const accessToken = await decryptToken(row.access_token_ciphertext);
  const validation = await validateTwitchToken(accessToken);

  if (!validation) {
    const refreshed = await refreshConnection(admin, row);

    if (Number(refreshed.token_version) !== Number(row.token_version) + 1) {
      return validateStoredConnection(admin, refreshed, true);
    }

    return refreshed;
  }

  const checked = checkedValidation(validation, row.twitch_user_id);
  const now = new Date();
  const expiresAt = checked.expiresIn > 0
    ? new Date(now.getTime() + checked.expiresIn * 1000).toISOString()
    : null;

  const { data, error } = await admin
    .from(TOKEN_TABLE)
    .update({
      twitch_login: checked.twitchLogin || row.twitch_login,
      twitch_client_id: checked.twitchClientId,
      scopes: checked.scopes,
      access_token_expires_at: expiresAt,
      last_validated_at: now.toISOString(),
      reconnect_required: false,
      updated_at: now.toISOString(),
    })
    .eq('user_id', row.user_id)
    .select('*')
    .single();

  if (error) {
    throw new ApiError(500, 'twitch_connection_write_failed', error.message);
  }

  return data as ConnectionRow;
}


function requireConnectedRow(row: ConnectionRow | null) {
  if (!row) {
    throw new ApiError(
      409,
      'twitch_reconnect_required',
      'Reconnect Twitch once to create the secure SquadView Twitch connection.',
    );
  }

  return row;
}

async function twitchHelixJson(
  admin: ReturnType<typeof createAdminClient>,
  row: ConnectionRow,
  pathname: string,
  searchParams: Record<string, string>,
) {
  let current = await validateStoredConnection(admin, row, false);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const accessToken = await decryptToken(current.access_token_ciphertext);
    const url = new URL(`https://api.twitch.tv${pathname}`);

    for (const [key, value] of Object.entries(searchParams)) {
      if (value) url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': current.twitch_client_id,
        Accept: 'application/json',
      },
    });

    if (response.status === 401 && attempt === 0) {
      current = await refreshConnection(admin, current);
      continue;
    }

    if (response.status === 401) {
      await markReconnectRequired(admin, current.user_id);

      throw new ApiError(
        409,
        'twitch_reconnect_required',
        'Twitch authorization could not be refreshed. Reconnect Twitch once to continue.',
      );
    }

    if (!response.ok) {
      throw new ApiError(
        502,
        'twitch_following_failed',
        `Twitch API request failed with ${response.status}.`,
        {
          endpoint: pathname,
          status: response.status,
        },
      );
    }

    return {
      connection: current,
      payload: await response.json(),
    };
  }

  throw new ApiError(
    502,
    'twitch_following_failed',
    'SquadView could not complete the Twitch API request.',
  );
}

function normalizeThumbnail(value: unknown) {
  return String(value || '')
    .replace('{width}', '640')
    .replace('{height}', '360');
}

async function loadFollowedLiveStreamsServer(
  admin: ReturnType<typeof createAdminClient>,
  initialRow: ConnectionRow,
) {
  let row = initialRow;
  let cursor = '';
  const streams: Record<string, unknown>[] = [];

  for (let page = 0; page < 3; page += 1) {
    const result = await twitchHelixJson(
      admin,
      row,
      '/helix/streams/followed',
      {
        user_id: row.twitch_user_id,
        first: '100',
        after: cursor,
      },
    );

    row = result.connection;

    const pageStreams = Array.isArray(result.payload?.data)
      ? result.payload.data
      : [];

    streams.push(...pageStreams);
    cursor = String(result.payload?.pagination?.cursor || '');

    if (!cursor) break;
  }

  const normalized = streams
    .map((stream: Record<string, unknown>) => ({
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

  return {
    connection: row,
    streams: normalized,
  };
}

async function loadFollowedChannelsServer(
  admin: ReturnType<typeof createAdminClient>,
  initialRow: ConnectionRow,
) {
  let row = initialRow;
  let cursor = '';
  const follows: Record<string, unknown>[] = [];

  for (let page = 0; page < 20; page += 1) {
    const result = await twitchHelixJson(
      admin,
      row,
      '/helix/channels/followed',
      {
        user_id: row.twitch_user_id,
        first: '100',
        after: cursor,
      },
    );

    row = result.connection;

    const pageFollows = Array.isArray(result.payload?.data)
      ? result.payload.data
      : [];

    follows.push(...pageFollows);
    cursor = String(result.payload?.pagination?.cursor || '');

    if (!cursor) break;
  }

  const normalized = follows
    .map((item: Record<string, unknown>) => ({
      broadcaster_id: String(item?.broadcaster_id || ''),
      broadcaster_login: String(item?.broadcaster_login || '').toLowerCase(),
      broadcaster_name: String(item?.broadcaster_name || item?.broadcaster_login || ''),
      followed_at: String(item?.followed_at || ''),
    }))
    .filter((item) => item.broadcaster_login);

  return {
    connection: row,
    channels: normalized,
  };
}


function normalizeChannelLogin(value: unknown) {
  const channel = String(value || '')
    .trim()
    .replace(/^#/, '')
    .toLowerCase();

  if (!/^[a-z0-9_]{1,25}$/.test(channel)) {
    throw new ApiError(
      400,
      'twitch_channel_invalid',
      'Choose a valid Twitch channel before opening native chat.',
    );
  }

  return channel;
}

function normalizeTwitchUserId(value: unknown) {
  const userId = String(value || '').trim();

  if (!/^\d{1,30}$/.test(userId)) {
    throw new ApiError(
      400,
      'twitch_broadcaster_invalid',
      'SquadView could not identify the Twitch broadcaster for native chat.',
    );
  }

  return userId;
}

function normalizeEventSubSessionId(value: unknown) {
  const sessionId = String(value || '').trim();

  if (
    !sessionId ||
    sessionId.length > 256 ||
    !/^[A-Za-z0-9_-]+$/.test(sessionId)
  ) {
    throw new ApiError(
      400,
      'twitch_eventsub_session_invalid',
      'The Twitch EventSub WebSocket session is invalid.',
    );
  }

  return sessionId;
}

async function prepareNativeChatServer(
  admin: ReturnType<typeof createAdminClient>,
  initialRow: ConnectionRow,
  channel: unknown,
) {
  const login = normalizeChannelLogin(channel);

  const result = await twitchHelixJson(
    admin,
    initialRow,
    '/helix/users',
    { login },
  );

  const broadcaster = Array.isArray(result.payload?.data)
    ? result.payload.data[0]
    : null;

  const broadcasterUserId = String(broadcaster?.id || '').trim();

  if (!broadcasterUserId) {
    throw new ApiError(
      404,
      'twitch_channel_not_found',
      `Twitch channel "${login}" was not found.`,
    );
  }

  return {
    connection: result.connection,
    broadcaster: {
      id: broadcasterUserId,
      login: String(broadcaster?.login || login).toLowerCase(),
      display_name: String(broadcaster?.display_name || broadcaster?.login || login),
      profile_image_url: String(broadcaster?.profile_image_url || ''),
    },
  };
}

async function createNativeChatSubscriptionServer(
  admin: ReturnType<typeof createAdminClient>,
  initialRow: ConnectionRow,
  sessionIdValue: unknown,
  broadcasterUserIdValue: unknown,
) {
  const sessionId = normalizeEventSubSessionId(sessionIdValue);
  const broadcasterUserId = normalizeTwitchUserId(broadcasterUserIdValue);
  let current = await validateStoredConnection(admin, initialRow, false);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const accessToken = await decryptToken(current.access_token_ciphertext);

    const response = await fetch(
      'https://api.twitch.tv/helix/eventsub/subscriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': current.twitch_client_id,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          type: 'channel.chat.message',
          version: '1',
          condition: {
            broadcaster_user_id: broadcasterUserId,
            user_id: current.twitch_user_id,
          },
          transport: {
            method: 'websocket',
            session_id: sessionId,
          },
        }),
      },
    );

    if (response.status === 401 && attempt === 0) {
      current = await refreshConnection(admin, current);
      continue;
    }

    if (response.status === 401) {
      await markReconnectRequired(admin, current.user_id);

      throw new ApiError(
        409,
        'twitch_reconnect_required',
        'Twitch authorization could not be refreshed. Reconnect Twitch once to continue.',
      );
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(
        response.status >= 500 ? 502 : response.status,
        'twitch_chat_subscription_failed',
        'Twitch did not accept the native chat subscription.',
        {
          status: response.status,
          twitch_message: String(payload?.message || ''),
        },
      );
    }

    const subscription = Array.isArray(payload?.data)
      ? payload.data[0]
      : null;

    if (!subscription?.id) {
      throw new ApiError(
        502,
        'twitch_chat_subscription_failed',
        'Twitch accepted the request but did not return a chat subscription.',
      );
    }

    return {
      connection: current,
      subscription: {
        id: String(subscription.id),
        status: String(subscription.status || ''),
        type: String(subscription.type || ''),
        version: String(subscription.version || ''),
        created_at: String(subscription.created_at || ''),
      },
    };
  }

  throw new ApiError(
    502,
    'twitch_chat_subscription_failed',
    'SquadView could not create the Twitch native chat subscription.',
  );
}



function twitchEmoteImageUrl(
  templateValue: unknown,
  emote: Record<string, unknown>,
) {
  const id = String(emote?.id || '').trim();
  if (!id) return '';

  const formats = Array.isArray(emote?.format)
    ? emote.format.map((value) => String(value || '')).filter(Boolean)
    : [];

  const themes = Array.isArray(emote?.theme_mode)
    ? emote.theme_mode.map((value) => String(value || '')).filter(Boolean)
    : [];

  const scales = Array.isArray(emote?.scale)
    ? emote.scale.map((value) => String(value || '')).filter(Boolean)
    : [];

  // Picker thumbnails intentionally stay static. Rendering many animated
  // emotes at once can compete with Twitch video decoding on phones.
  const format = formats.includes('static') ? 'static' : (formats[0] || 'static');
  const theme = themes.includes('dark') ? 'dark' : (themes[0] || 'dark');
  const scale = scales.includes('1.0') ? '1.0' : (scales[0] || '1.0');

  const template = String(
    templateValue ||
      'https://static-cdn.jtvnw.net/emoticons/v2/{{id}}/{{format}}/{{theme_mode}}/{{scale}}',
  );

  return template
    .replace(/\{\{id\}\}|\{id\}/g, encodeURIComponent(id))
    .replace(/\{\{format\}\}|\{format\}/g, encodeURIComponent(format))
    .replace(/\{\{theme_mode\}\}|\{theme_mode\}/g, encodeURIComponent(theme))
    .replace(/\{\{scale\}\}|\{scale\}/g, encodeURIComponent(scale));
}


async function loadTwitchUsersByIdsServer(
  admin: ReturnType<typeof createAdminClient>,
  initialRow: ConnectionRow,
  userIds: string[],
) {
  let row = await validateStoredConnection(admin, initialRow, false);
  const uniqueIds = [...new Set(
    userIds.map((value) => String(value || '').trim()).filter(Boolean),
  )];
  const users = new Map<string, Record<string, unknown>>();

  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const batch = uniqueIds.slice(offset, offset + 100);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const accessToken = await decryptToken(row.access_token_ciphertext);
      const url = new URL('https://api.twitch.tv/helix/users');

      for (const id of batch) {
        url.searchParams.append('id', id);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': row.twitch_client_id,
          Accept: 'application/json',
        },
      });

      if (response.status === 401 && attempt === 0) {
        row = await refreshConnection(admin, row);
        continue;
      }

      if (response.status === 401) {
        await markReconnectRequired(admin, row.user_id);

        throw new ApiError(
          409,
          'twitch_reconnect_required',
          'Twitch authorization could not be refreshed. Reconnect Twitch once to continue.',
        );
      }

      if (!response.ok) {
        // Emote ownership labels are polish only. Do not fail the picker when
        // Twitch user metadata is temporarily unavailable.
        break;
      }

      const payload = await response.json().catch(() => ({}));
      const data = Array.isArray(payload?.data) ? payload.data : [];

      for (const user of data) {
        const id = String(user?.id || '').trim();
        if (id) users.set(id, user);
      }

      break;
    }
  }

  return {
    connection: row,
    users,
  };
}

function emoteCategoryRank(
  emote: Record<string, unknown>,
  broadcasterUserId: string,
) {
  const ownerId = String(emote?.owner_id || '').trim();
  const type = String(emote?.emote_type || '').trim().toLowerCase();

  if (broadcasterUserId && ownerId === broadcasterUserId) return 0;

  if (
    ownerId &&
    ['subscriptions', 'follower', 'bitstier', 'channelpoints'].includes(type)
  ) {
    return 1;
  }

  if (
    ['rewards', 'hypetrain', 'prime', 'turbo', 'limitedtime', 'twofactor', 'owl2019'].includes(type)
  ) {
    return 2;
  }

  return 3;
}

async function loadUserEmotesServer(
  admin: ReturnType<typeof createAdminClient>,
  initialRow: ConnectionRow,
  broadcasterUserIdValue: unknown,
) {
  let row = await validateStoredConnection(admin, initialRow, true);

  if (!row.scopes.includes('user:read:emotes')) {
    throw new ApiError(
      409,
      'twitch_emote_scope_required',
      'Reconnect Twitch once to enable your SquadView emote picker.',
      {
        missing_scopes: ['user:read:emotes'],
      },
    );
  }

  const broadcasterUserId = broadcasterUserIdValue
    ? normalizeTwitchUserId(broadcasterUserIdValue)
    : '';

  let cursor = '';
  let template = '';
  const emotes: Record<string, unknown>[] = [];

  for (let page = 0; page < 25; page += 1) {
    const result = await twitchHelixJson(
      admin,
      row,
      '/helix/chat/emotes/user',
      {
        user_id: row.twitch_user_id,
        broadcaster_id: broadcasterUserId,
        after: cursor,
      },
    );

    row = result.connection;

    const pageEmotes = Array.isArray(result.payload?.data)
      ? result.payload.data
      : [];

    if (!template) template = String(result.payload?.template || '');

    emotes.push(...pageEmotes);
    cursor = String(result.payload?.pagination?.cursor || '');

    if (!cursor) break;
  }

  const ownerIds = emotes
    .map((item: Record<string, unknown>) => String(item?.owner_id || '').trim())
    .filter(Boolean);

  const ownerLookup = await loadTwitchUsersByIdsServer(
    admin,
    row,
    ownerIds,
  );

  row = ownerLookup.connection;

  const seen = new Set<string>();

  const normalized = emotes
    .map((item: Record<string, unknown>, sourceIndex: number) => {
      const id = String(item?.id || '').trim();
      const name = String(item?.name || '').trim();

      if (!id || !name || seen.has(id)) return null;
      seen.add(id);

      const ownerId = String(item?.owner_id || '').trim();

      return {
        id,
        name,
        emote_type: String(item?.emote_type || ''),
        emote_set_id: String(item?.emote_set_id || ''),
        owner_id: ownerId,
        owner_login: String(ownerLookup.users.get(ownerId)?.login || ''),
        owner_name: String(
          ownerLookup.users.get(ownerId)?.display_name ||
          ownerLookup.users.get(ownerId)?.login ||
          ''
        ),
        is_channel_emote: Boolean(
          broadcasterUserId && ownerId === broadcasterUserId
        ),
        category_rank: emoteCategoryRank(item, broadcasterUserId),
        source_index: sourceIndex,
        format: Array.isArray(item?.format)
          ? item.format.map((value) => String(value || '')).filter(Boolean)
          : [],
        image_url: twitchEmoteImageUrl(template, item),
      };
    })
    .filter(Boolean)
    .sort((first: any, second: any) => {
      const categoryDifference =
        Number(first?.category_rank || 0) -
        Number(second?.category_rank || 0);

      if (categoryDifference) return categoryDifference;

      const ownerDifference = String(
        first?.owner_name ||
        first?.owner_login ||
        first?.owner_id ||
        '',
      ).localeCompare(
        String(
          second?.owner_name ||
          second?.owner_login ||
          second?.owner_id ||
          '',
        ),
      );

      if (ownerDifference) return ownerDifference;

      const sourceDifference =
        Number(first?.source_index || 0) -
        Number(second?.source_index || 0);

      if (sourceDifference) return sourceDifference;

      return String(first?.name || '').localeCompare(
        String(second?.name || ''),
      );
    });

  return {
    connection: row,
    emotes: normalized,
  };
}

function normalizeChatMessage(value: unknown) {
  const message = String(value || '').trim();

  if (!message) {
    throw new ApiError(
      400,
      'twitch_chat_message_empty',
      'Enter a message before sending.',
    );
  }

  if (message.length > 500) {
    throw new ApiError(
      422,
      'twitch_chat_message_too_long',
      'Twitch chat messages can contain up to 500 characters.',
    );
  }

  return message;
}

function normalizeReplyParentMessageId(value: unknown) {
  const messageId = String(value || '').trim();

  if (!messageId) return '';

  if (messageId.length > 128 || !/^[A-Za-z0-9_-]+$/.test(messageId)) {
    throw new ApiError(
      400,
      'twitch_reply_message_invalid',
      'The Twitch reply message ID is invalid.',
    );
  }

  return messageId;
}

async function sendNativeChatMessageServer(
  admin: ReturnType<typeof createAdminClient>,
  initialRow: ConnectionRow,
  broadcasterUserIdValue: unknown,
  messageValue: unknown,
  replyParentMessageIdValue: unknown,
) {
  const broadcasterUserId = normalizeTwitchUserId(broadcasterUserIdValue);
  const message = normalizeChatMessage(messageValue);
  const replyParentMessageId = normalizeReplyParentMessageId(
    replyParentMessageIdValue,
  );

  let current = await validateStoredConnection(admin, initialRow, false);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const accessToken = await decryptToken(current.access_token_ciphertext);

    const body: Record<string, unknown> = {
      broadcaster_id: broadcasterUserId,
      sender_id: current.twitch_user_id,
      message,
    };

    if (replyParentMessageId) {
      body.reply_parent_message_id = replyParentMessageId;
    }

    const response = await fetch(
      'https://api.twitch.tv/helix/chat/messages',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': current.twitch_client_id,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (response.status === 401 && attempt === 0) {
      current = await refreshConnection(admin, current);
      continue;
    }

    if (response.status === 401) {
      await markReconnectRequired(admin, current.user_id);

      throw new ApiError(
        409,
        'twitch_reconnect_required',
        'Twitch authorization could not be refreshed. Reconnect Twitch once to continue.',
      );
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(
        response.status >= 500 ? 502 : response.status,
        'twitch_chat_send_failed',
        String(payload?.message || 'Twitch could not send that chat message.'),
        {
          status: response.status,
        },
      );
    }

    const sent = Array.isArray(payload?.data)
      ? payload.data[0]
      : null;

    if (!sent?.is_sent) {
      throw new ApiError(
        409,
        'twitch_chat_message_dropped',
        String(
          sent?.drop_reason?.message ||
          'Twitch did not accept that chat message.',
        ),
        {
          code: String(sent?.drop_reason?.code || ''),
        },
      );
    }

    return {
      connection: current,
      message: {
        message_id: String(sent?.message_id || ''),
        is_sent: true,
      },
    };
  }

  throw new ApiError(
    502,
    'twitch_chat_send_failed',
    'SquadView could not send that Twitch chat message.',
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, code: 'method_not_allowed', message: 'Use POST.' }, 405);
  }

  try {
    const admin = createAdminClient();
    const user = await authenticateUser(req, admin);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();

    if (action === 'connect') {
      const providerToken = firstString(body?.provider_token);
      const providerRefreshToken = firstString(body?.provider_refresh_token);

      if (!providerToken) {
        throw new ApiError(
          400,
          'twitch_provider_token_missing',
          'The Twitch OAuth callback did not include a provider access token.',
        );
      }

      const row = await saveConnectedGrant(
        admin,
        user,
        providerToken,
        providerRefreshToken,
      );

      return json({
        ...safeStatus(row),
        message: row.refresh_token_ciphertext
          ? 'Secure Twitch connection saved with refresh support.'
          : 'Secure Twitch connection saved, but Twitch/Supabase did not return a refresh token.',
      });
    }

    if (action === 'status') {
      return json(safeStatus(await loadConnection(admin, user.id)));
    }

    if (action === 'chat-prepare') {
      const row = requireConnectedRow(await loadConnection(admin, user.id));
      const result = await prepareNativeChatServer(
        admin,
        row,
        body?.channel,
      );

      return json({
        ok: true,
        broadcaster: result.broadcaster,
        connection: safeStatus(result.connection),
      });
    }

    if (action === 'chat-subscribe') {
      const row = requireConnectedRow(await loadConnection(admin, user.id));
      const result = await createNativeChatSubscriptionServer(
        admin,
        row,
        body?.session_id,
        body?.broadcaster_user_id,
      );

      return json({
        ok: true,
        subscription: result.subscription,
        connection: safeStatus(result.connection),
      });
    }

    if (action === 'chat-emotes') {
      const row = requireConnectedRow(await loadConnection(admin, user.id));
      const result = await loadUserEmotesServer(
        admin,
        row,
        body?.broadcaster_user_id,
      );

      return json({
        ok: true,
        emotes: result.emotes,
        connection: safeStatus(result.connection),
      });
    }

    if (action === 'chat-send') {
      const row = requireConnectedRow(await loadConnection(admin, user.id));
      const result = await sendNativeChatMessageServer(
        admin,
        row,
        body?.broadcaster_user_id,
        body?.message,
        body?.reply_parent_message_id,
      );

      return json({
        ok: true,
        message: result.message,
        connection: safeStatus(result.connection),
      });
    }

    if (action === 'followed-live') {
      const row = requireConnectedRow(await loadConnection(admin, user.id));
      const result = await loadFollowedLiveStreamsServer(admin, row);

      return json({
        ok: true,
        streams: result.streams,
        connection: safeStatus(result.connection),
      });
    }

    if (action === 'followed-channels') {
      const row = requireConnectedRow(await loadConnection(admin, user.id));
      const result = await loadFollowedChannelsServer(admin, row);

      return json({
        ok: true,
        channels: result.channels,
        connection: safeStatus(result.connection),
      });
    }

    if (action === 'validate') {
      const row = await loadConnection(admin, user.id);

      if (!row) {
        throw new ApiError(
          409,
          'twitch_reconnect_required',
          'Reconnect Twitch once to create the secure SquadView Twitch connection.',
        );
      }

      const validRow = await validateStoredConnection(admin, row, true);

      return json({
        ...safeStatus(validRow),
        message: 'Twitch authorization is valid.',
      });
    }

    throw new ApiError(400, 'unknown_action', 'Unknown Twitch account action.');
  } catch (error) {
    if (error instanceof ApiError) {
      return json({
        ok: false,
        code: error.code,
        message: error.message,
        details: error.details || null,
      }, error.status);
    }

    console.error('[SquadView twitch-account]', error);

    return json({
      ok: false,
      code: 'internal_error',
      message: 'SquadView could not complete the Twitch connection request.',
    }, 500);
  }
});
