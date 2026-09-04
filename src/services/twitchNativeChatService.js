import { supabase } from '../lib/supabase';

const TWITCH_ACCOUNT_FUNCTION = 'twitch-account';
const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30';
const NATIVE_CHAT_FLAG_KEY = 'squadview:native-twitch-chat:v1';

const ENABLE_VALUES = new Set(['1', 'true', 'on', 'yes']);
const DISABLE_VALUES = new Set(['0', 'false', 'off', 'no']);

function nativeChatError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

async function readFunctionError(error) {
  let payload = null;

  try {
    if (error?.context?.clone) {
      payload = await error.context.clone().json();
    }
  } catch {
    // Keep the original Supabase Functions error if the body is unavailable.
  }

  return nativeChatError(
    payload?.code || 'twitch_native_chat_failed',
    payload?.message || error?.message || 'Native Twitch chat could not connect.',
    payload?.details || payload || null,
  );
}

async function invokeTwitchAccount(action, payload = {}) {
  if (!supabase) {
    throw nativeChatError(
      'authentication_required',
      'Sign in to SquadView with Twitch to use native chat.',
    );
  }

  const { data, error } = await supabase.functions.invoke(
    TWITCH_ACCOUNT_FUNCTION,
    {
      body: {
        action,
        ...payload,
      },
    },
  );

  if (error) throw await readFunctionError(error);

  if (!data?.ok) {
    throw nativeChatError(
      data?.code || 'twitch_native_chat_failed',
      data?.message || 'Native Twitch chat could not connect.',
      data?.details || data || null,
    );
  }

  return data;
}

function safeLocalStorageGet(key) {
  if (typeof window === 'undefined' || !window.localStorage) return '';

  try {
    return String(window.localStorage.getItem(key) || '');
  } catch {
    return '';
  }
}

function safeLocalStorageSet(key, value) {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Runtime flag persistence is best effort only.
  }
}

export async function shouldUseNativeTwitchChat() {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  const requested = String(params.get('nativeChat') || '').trim().toLowerCase();

  if (ENABLE_VALUES.has(requested)) {
    safeLocalStorageSet(NATIVE_CHAT_FLAG_KEY, '1');
    return true;
  }

  if (DISABLE_VALUES.has(requested)) {
    safeLocalStorageSet(NATIVE_CHAT_FLAG_KEY, '0');
    return false;
  }

  const stored = safeLocalStorageGet(NATIVE_CHAT_FLAG_KEY);

  if (stored === '1') return true;
  if (stored === '0') return false;

  if (!supabase) return false;

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) return false;
    return Boolean(data?.session?.user?.id);
  } catch {
    return false;
  }
}

export function disableNativeTwitchChat() {
  safeLocalStorageSet(NATIVE_CHAT_FLAG_KEY, '0');
}

export function enableNativeTwitchChat() {
  safeLocalStorageSet(NATIVE_CHAT_FLAG_KEY, '1');
}

function normalizeChatEvent(frame) {
  const event = frame?.payload?.event || {};
  const message = event?.message || {};
  const fragments = Array.isArray(message?.fragments)
    ? message.fragments
    : [];

  return {
    id: String(event?.message_id || frame?.metadata?.message_id || ''),
    sentAt: String(frame?.metadata?.message_timestamp || ''),
    broadcasterUserId: String(event?.broadcaster_user_id || ''),
    broadcasterLogin: String(event?.broadcaster_user_login || '').toLowerCase(),
    chatterUserId: String(event?.chatter_user_id || ''),
    chatterLogin: String(event?.chatter_user_login || '').toLowerCase(),
    chatterName: String(event?.chatter_user_name || event?.chatter_user_login || ''),
    color: String(event?.color || ''),
    text: String(message?.text || ''),
    fragments: fragments.map((fragment) => ({
      type: String(fragment?.type || 'text'),
      text: String(fragment?.text || ''),
      emoteId: String(fragment?.emote?.id || ''),
      emoteSetId: String(fragment?.emote?.emote_set_id || ''),
      emoteOwnerId: String(fragment?.emote?.owner_id || ''),
      emoteFormats: Array.isArray(fragment?.emote?.format)
        ? fragment.emote.format.map((value) => String(value || '')).filter(Boolean)
        : [],
    })),
    badges: Array.isArray(event?.badges)
      ? event.badges.map((badge) => ({
          setId: String(badge?.set_id || ''),
          id: String(badge?.id || ''),
          info: String(badge?.info || ''),
        }))
      : [],
  };
}



export async function loadNativeTwitchChatEmotes({
  broadcasterUserId = '',
} = {}) {
  return invokeTwitchAccount('chat-emotes', {
    broadcaster_user_id: String(broadcasterUserId || '').trim() || undefined,
  });
}

export async function sendNativeTwitchChatMessage({
  broadcasterUserId,
  message,
  replyParentMessageId = '',
}) {
  const cleanBroadcasterUserId = String(broadcasterUserId || '').trim();
  const cleanMessage = String(message || '').trim();
  const cleanReplyParentMessageId = String(replyParentMessageId || '').trim();

  if (!cleanBroadcasterUserId) {
    throw nativeChatError(
      'twitch_broadcaster_invalid',
      'SquadView is still connecting to this Twitch chat.',
    );
  }

  if (!cleanMessage) {
    throw nativeChatError(
      'twitch_chat_message_empty',
      'Enter a message before sending.',
    );
  }

  if (cleanMessage.length > 500) {
    throw nativeChatError(
      'twitch_chat_message_too_long',
      'Twitch chat messages can contain up to 500 characters.',
    );
  }

  return invokeTwitchAccount('chat-send', {
    broadcaster_user_id: cleanBroadcasterUserId,
    message: cleanMessage,
    reply_parent_message_id: cleanReplyParentMessageId || undefined,
  });
}

export function createNativeTwitchChat({
  channel,
  onMessage,
  onStatus,
  onError,
}) {
  let disposed = false;
  let broadcaster = null;
  let primarySocket = null;
  let handoffSocket = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  const intentionalClose = new WeakSet();
  const seenMessageIds = new Set();
  const seenMessageQueue = [];

  const emitStatus = (status, details = null) => {
    if (!disposed) onStatus?.(status, details);
  };

  const emitError = (error) => {
    if (!disposed) onError?.(error);
  };

  const rememberMessageId = (id) => {
    if (!id) return true;
    if (seenMessageIds.has(id)) return false;

    seenMessageIds.add(id);
    seenMessageQueue.push(id);

    while (seenMessageQueue.length > 500) {
      const oldest = seenMessageQueue.shift();
      if (oldest) seenMessageIds.delete(oldest);
    }

    return true;
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleFreshReconnect = () => {
    if (disposed || reconnectTimer || handoffSocket) return;

    reconnectAttempts += 1;
    const delay = Math.min(30000, 1000 * (2 ** Math.min(reconnectAttempts - 1, 5)));

    emitStatus('reconnecting', { delay });

    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connectSocket(EVENTSUB_URL, 'fresh');
    }, delay);
  };

  const closeSocketIntentionally = (socket) => {
    if (!socket) return;
    intentionalClose.add(socket);

    try {
      socket.close(1000, 'SquadView chat handoff');
    } catch {
      // Best effort cleanup.
    }
  };

  const subscribeSocket = async (socket, sessionId) => {
    emitStatus('subscribing');

    try {
      const result = await invokeTwitchAccount('chat-subscribe', {
        session_id: sessionId,
        broadcaster_user_id: broadcaster?.id,
      });

      if (disposed || socket !== primarySocket) return;

      reconnectAttempts = 0;
      emitStatus('ready', {
        broadcaster,
        subscription: result?.subscription || null,
      });
    } catch (error) {
      if (disposed) return;

      closeSocketIntentionally(socket);
      if (socket === primarySocket) primarySocket = null;
      emitError(error);
    }
  };

  const handleFrame = async (socket, mode, frame) => {
    const messageType = String(frame?.metadata?.message_type || '');

    if (messageType === 'session_welcome') {
      const session = frame?.payload?.session || {};
      const sessionId = String(session?.id || '');

      if (!sessionId) {
        emitError(
          nativeChatError(
            'twitch_eventsub_welcome_invalid',
            'Twitch EventSub did not return a WebSocket session ID.',
          ),
        );
        closeSocketIntentionally(socket);
        return;
      }

      if (mode === 'handoff') {
        if (socket !== handoffSocket) return;

        const previous = primarySocket;
        primarySocket = socket;
        handoffSocket = null;
        reconnectAttempts = 0;
        emitStatus('ready', { broadcaster });

        if (previous && previous !== socket) {
          closeSocketIntentionally(previous);
        }

        return;
      }

      if (socket !== primarySocket) return;
      await subscribeSocket(socket, sessionId);
      return;
    }

    if (messageType === 'notification') {
      if (String(frame?.metadata?.subscription_type || '') !== 'channel.chat.message') {
        return;
      }

      const normalized = normalizeChatEvent(frame);

      if (rememberMessageId(normalized.id)) {
        onMessage?.(normalized);
      }

      return;
    }

    if (messageType === 'session_reconnect') {
      if (socket !== primarySocket || handoffSocket) return;

      const reconnectUrl = String(frame?.payload?.session?.reconnect_url || '');

      if (!reconnectUrl.startsWith('wss://')) {
        scheduleFreshReconnect();
        return;
      }

      emitStatus('reconnecting');
      connectSocket(reconnectUrl, 'handoff');
      return;
    }

    if (messageType === 'revocation') {
      const status = String(frame?.payload?.subscription?.status || '');

      emitError(
        nativeChatError(
          'twitch_chat_subscription_revoked',
          status
            ? `Twitch revoked the native chat subscription (${status}).`
            : 'Twitch revoked the native chat subscription.',
          { status },
        ),
      );
    }
  };

  function connectSocket(url, mode = 'fresh') {
    if (disposed) return;

    clearReconnectTimer();

    let socket;

    try {
      socket = new WebSocket(url);
    } catch (error) {
      emitError(
        nativeChatError(
          'twitch_eventsub_connection_failed',
          error?.message || 'Could not open the Twitch EventSub connection.',
        ),
      );
      return;
    }

    if (mode === 'handoff') {
      handoffSocket = socket;
    } else {
      if (primarySocket && primarySocket !== socket) {
        closeSocketIntentionally(primarySocket);
      }
      primarySocket = socket;
    }

    emitStatus(mode === 'handoff' ? 'reconnecting' : 'connecting');

    let watchdogTimer = null;
    let keepaliveSeconds = 30;

    const resetWatchdog = (frame) => {
      const supplied = Number(frame?.payload?.session?.keepalive_timeout_seconds || 0);

      if (Number.isFinite(supplied) && supplied >= 10) {
        keepaliveSeconds = supplied;
      }

      if (watchdogTimer) window.clearTimeout(watchdogTimer);

      watchdogTimer = window.setTimeout(() => {
        if (disposed) return;

        try {
          socket.close(4005, 'SquadView keepalive timeout');
        } catch {
          scheduleFreshReconnect();
        }
      }, (keepaliveSeconds + 5) * 1000);
    };

    socket.addEventListener('message', (event) => {
      if (disposed) return;

      let frame;

      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }

      resetWatchdog(frame);
      void handleFrame(socket, mode, frame);
    });

    socket.addEventListener('close', () => {
      if (watchdogTimer) {
        window.clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }

      if (disposed || intentionalClose.has(socket)) return;

      if (socket === handoffSocket) {
        handoffSocket = null;

        if (primarySocket) {
          emitStatus('ready', { broadcaster });
          return;
        }
      }

      if (socket === primarySocket) {
        primarySocket = null;
      }

      scheduleFreshReconnect();
    });

    socket.addEventListener('error', () => {
      // The close event owns retry behavior. This avoids duplicate reconnect timers.
    });
  }

  const start = async () => {
    emitStatus('preparing');

    try {
      const result = await invokeTwitchAccount('chat-prepare', { channel });

      if (disposed) return;

      broadcaster = result?.broadcaster || null;

      if (!broadcaster?.id) {
        throw nativeChatError(
          'twitch_channel_not_found',
          'SquadView could not identify this Twitch channel for native chat.',
        );
      }

      connectSocket(EVENTSUB_URL, 'fresh');
    } catch (error) {
      emitError(error);
    }
  };

  void start();

  return {
    close() {
      disposed = true;
      clearReconnectTimer();

      if (primarySocket) {
        closeSocketIntentionally(primarySocket);
        primarySocket = null;
      }

      if (handoffSocket) {
        closeSocketIntentionally(handoffSocket);
        handoffSocket = null;
      }
    },
  };
}
