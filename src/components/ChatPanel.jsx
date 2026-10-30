import { useEffect, useMemo, useRef, useState } from 'react';
import { signInWithTwitch } from '../services/accountService';
import { supabase } from '../lib/supabase';
import {
  createNativeTwitchChat,
  disableNativeTwitchChat,
  enableNativeTwitchChat,
  loadNativeTwitchChatEmotes,
  loadNativeTwitchChatBadges,
  sendNativeTwitchChatMessage,
  shouldUseNativeTwitchChat,
} from '../services/twitchNativeChatService';

const MAX_NATIVE_MESSAGES = 250;
const NATIVE_CHAT_DRAFT_PREFIX = 'squadview:native-chat-draft:v1:';
// Short local chat history; messages are never uploaded to SquadView.
const NATIVE_CHAT_HISTORY_PREFIX = 'squadview:native-chat-history:v1:';
const NATIVE_CHAT_HISTORY_TTL_MS = 10 * 60 * 1000;
const MAX_NATIVE_HISTORY_MESSAGES = 80;
const NATIVE_CHAT_HISTORY_PERSIST_INTERVAL_MS = 2000;
const recentNativeChatHistory = new Map();
const emoteCache = new Map();
// Official Twitch badge artwork, cached only in memory by broadcaster.
const nativeBadgeCatalogCache = new Map();
const BADGE_CATALOG_TTL_MS = 10 * 60 * 1000;

function resolveNativeBadge(badge, catalogs) {
  const setId = String(badge?.setId || '').trim();
  const versionId = String(badge?.id || '').trim();
  if (!setId || !versionId || !catalogs) return null;
  const key = `${setId}/${versionId}`;
  return catalogs.channel?.[key] || catalogs.global?.[key] || null;
}

function NativeChatBadges({ badges, catalogs }) {
  if (!Array.isArray(badges) || !badges.length || !catalogs) return null;
  return <>
    {badges.map((badge, index) => {
      const details = resolveNativeBadge(badge, catalogs);
      if (!details?.image_url || !/^https:\/\//.test(details.image_url)) return null;
      const label = String(details.title || details.description || badge?.setId || 'Twitch badge');
      return (
        <img
          key={`${badge?.setId || 'badge'}:${badge?.id || ''}:${index}`}
          src={details.image_url}
          width={18}
          height={18}
          alt={label}
          title={label}
          loading="lazy"
          decoding="async"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
          style={{ display: 'inline-block', width: 18, height: 18, objectFit: 'contain', verticalAlign: 'middle', marginRight: 3 }}
        />
      );
    })}
  </>;
}

// Native chat bottom composer QOL: keep live messages above the message composer.

function nativeChatDraftKey(channel) {
  return `${NATIVE_CHAT_DRAFT_PREFIX}${String(channel || '').trim().toLowerCase()}`;
}

function readNativeChatDraft(channel) {
  if (!channel) return '';
  try {
    return String(sessionStorage.getItem(nativeChatDraftKey(channel)) || '').slice(0, 500);
  } catch {
    return '';
  }
}

function writeNativeChatDraft(channel, value) {
  if (!channel) return;
  try {
    const key = nativeChatDraftKey(channel);
    if (value) sessionStorage.setItem(key, String(value).slice(0, 500));
    else sessionStorage.removeItem(key);
  } catch {
    // Native chat remains usable when session storage is unavailable.
  }
}

// Session-tab cache only: recent messages actually seen by this browser.
// A 10-minute age limit plus per-channel and channel-count caps prevent a chat archive.
function nativeChatHistoryKey(channel) {
  return `${NATIVE_CHAT_HISTORY_PREFIX}${channel}`;
}

function keepRecentNativeMessages(messages, now = Date.now()) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => {
      if (!message || typeof message.text !== 'string') return false;
      const timestamp = Date.parse(message.sentAt || '');
      const received = Number(message.receivedAt);
      const time = Number.isFinite(timestamp) ? timestamp : received;
      return Number.isFinite(time) && time <= now && now - time < NATIVE_CHAT_HISTORY_TTL_MS;
    })
    .slice(-MAX_NATIVE_HISTORY_MESSAGES);
}

function trimNativeChatHistoryCache() {
  const now = Date.now();
  for (const [key, value] of recentNativeChatHistory) {
    if (now - value.savedAt >= NATIVE_CHAT_HISTORY_TTL_MS) {
      recentNativeChatHistory.delete(key);
      try { sessionStorage.removeItem(nativeChatHistoryKey(key)); } catch { /* storage unavailable */ }
    }
  }
  // Only the last eight used channels may remain in memory or this tab's storage.
  while (recentNativeChatHistory.size > 8) {
    const oldest = recentNativeChatHistory.keys().next().value;
    recentNativeChatHistory.delete(oldest);
    try { sessionStorage.removeItem(nativeChatHistoryKey(oldest)); } catch { /* storage unavailable */ }
  }
}

function readNativeChatHistory(channel) {
  if (!channel) return [];
  trimNativeChatHistoryCache();
  const cached = recentNativeChatHistory.get(channel);
  if (cached) return keepRecentNativeMessages(cached.messages);

  try {
    const parsed = JSON.parse(sessionStorage.getItem(nativeChatHistoryKey(channel)) || 'null');
    const messages = keepRecentNativeMessages(parsed?.messages);
    if (messages.length) {
      recentNativeChatHistory.set(channel, {
        messages, savedAt: Date.now(), lastSavedAt: Date.now(),
      });
      trimNativeChatHistoryCache();
      return messages;
    }
    sessionStorage.removeItem(nativeChatHistoryKey(channel));
  } catch { /* history is always optional */ }
  return [];
}

function saveNativeChatHistory(channel, messages, persist = false) {
  if (!channel) return [];
  const now = Date.now();
  const previous = recentNativeChatHistory.get(channel);
  const retained = keepRecentNativeMessages(messages, now);
  // Refresh Map order so inactive channels are evicted first.
  recentNativeChatHistory.delete(channel);
  const entry = {
    messages: retained,
    savedAt: now,
    lastSavedAt: previous?.lastSavedAt || 0,
  };
  if (retained.length) recentNativeChatHistory.set(channel, entry);
  else {
    try { sessionStorage.removeItem(nativeChatHistoryKey(channel)); } catch { /* best effort */ }
  }
  trimNativeChatHistoryCache();
  if (retained.length && (persist || now - entry.lastSavedAt >= NATIVE_CHAT_HISTORY_PERSIST_INTERVAL_MS)) {
    try {
      sessionStorage.setItem(nativeChatHistoryKey(channel), JSON.stringify({ savedAt: now, messages: retained }));
      entry.lastSavedAt = now;
    } catch { /* storage limits must not interrupt chat */ }
  }
  return retained;
}

const TWITCH_EMOTE_TEMPLATE = 'https://static-cdn.jtvnw.net/emoticons/v2';

function twitchEmoteUrl(fragment) {
  const id = encodeURIComponent(String(fragment?.emoteId || ''));
  if (!id) return '';

  const formats = Array.isArray(fragment?.emoteFormats)
    ? fragment.emoteFormats
    : [];

  const format = formats.includes('animated') ? 'animated' : 'static';

  return `${TWITCH_EMOTE_TEMPLATE}/${id}/${format}/dark/1.0`;
}

// The deployed Twitch function already returns an emote's format and CDN image_url.
// Build the official animated CDN URL client-side, so animations don't need a new API deployment.
function nativePickerEmoteUrl(emote, allowAnimation) {
  const staticUrl = String(emote?.image_url || '');
  if (!allowAnimation || !Array.isArray(emote?.format) || !emote.format.includes('animated')) return staticUrl;
  // Only rewrite URLs served by Twitch's official emote CDN. Never rewrite arbitrary URLs.
  if (!/^https:\/\/static-cdn\.jtvnw\.net\/emoticons\/v2\//.test(staticUrl)) return staticUrl;
  return staticUrl.replace('/static/', '/animated/');
}

function TwitchEmote({ fragment }) {
  const [failed, setFailed] = useState(false);
  const src = twitchEmoteUrl(fragment);

  if (!src || failed) return <>{fragment?.text || ''}</>;

  return (
    <img
      src={src}
      alt={fragment?.text || 'Twitch emote'}
      title={fragment?.text || 'Twitch emote'}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{
        width: 28,
        height: 28,
        objectFit: 'contain',
        verticalAlign: 'middle',
        margin: '0 1px',
      }}
    />
  );
}

function ChatMessageBody({ message }) {
  const fragments = Array.isArray(message?.fragments)
    ? message.fragments
    : [];

  if (!fragments.length) return <>{message?.text || ''}</>;

  return (
    <>
      {fragments.map((fragment, index) => {
        const key = `${message?.id || 'message'}:${index}`;

        if (fragment?.type === 'emote' && fragment?.emoteId) {
          return <TwitchEmote key={key} fragment={fragment} />;
        }

        return <span key={key}>{fragment?.text || ''}</span>;
      })}
    </>
  );
}



// Keep Twitch emotes grouped by their real broadcaster, not a generic channel label.
// Twitch returns owner_id with each emote; names are enriched by twitch-account.
function buildNativeEmoteSections(availableEmotes, currentChannel, currentBroadcasterId) {
  const sections = [];
  const byKey = new Map();

  const append = (key, label, emote) => {
    let section = byKey.get(key);
    if (!section) {
      section = { key, label, emotes: [] };
      byKey.set(key, section);
      sections.push(section);
    }
    section.emotes.push(emote);
  };

  for (const emote of availableEmotes) {
    const ownerId = String(emote?.owner_id || '').trim();
    const type = String(emote?.emote_type || '').trim().toLowerCase();

    if (emote?.is_channel_emote || (ownerId && ownerId === currentBroadcasterId)) {
      append('current-channel', `Current channel · #${currentChannel}`, emote);
      continue;
    }

    if (ownerId && ownerId !== '0') {
      const ownerLogin = String(emote?.owner_login || '').trim();
      const ownerName = String(emote?.owner_name || '').trim();
      const displayName = ownerName || ownerLogin;
      append(
        `owner:${ownerId}`,
        displayName
          ? `#${displayName} · Channel emotes`
          : `Channel ID ${ownerId} · Name unavailable`,
        emote,
      );
      continue;
    }

    if (['globals', 'smilies', 'none'].includes(type) || !ownerId) {
      append('twitch-global', 'Twitch global emotes', emote);
      continue;
    }

    append('unlocked', 'Other unlocked emotes', emote);
  }

  return sections;
}

function ChatModeSwitch({ mode, onUseNative, onUseTwitch }) {
  const buttonStyle = (active) => ({
    minHeight: 32,
    border: '1px solid rgba(255,255,255,0.16)',
    background: active ? '#9147ff' : '#26262c',
    color: '#fff',
    borderRadius: 6,
    padding: '5px 8px',
    fontSize: 11,
    fontWeight: active ? 700 : 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <div
      role="group"
      aria-label="Chat mode"
      style={{
        display: 'flex',
        gap: 5,
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        aria-pressed={mode === 'native'}
        onClick={onUseNative}
        style={buttonStyle(mode === 'native')}
      >
        Native
      </button>
      <button
        type="button"
        aria-pressed={mode === 'twitch'}
        onClick={onUseTwitch}
        style={buttonStyle(mode === 'twitch')}
      >
        Twitch
      </button>
    </div>
  );
}

function IframeChat({
  channel,
  compact = false,
  onUseNative,
  onActivity,
}) {
  const iframeRef = useRef(null);
  const parent = window.location.hostname;
  const src = `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?parent=${encodeURIComponent(parent)}&darkpopout`;

  useEffect(() => {
    if (typeof onActivity !== 'function') return undefined;

    const interval = window.setInterval(() => {
      if (document.activeElement === iframeRef.current) {
        onActivity({ type: 'twitch_iframe_focus', channel });
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [channel, onActivity]);

  return (
    <section
      className={`chat-panel twitch-iframe-chat ${compact ? 'is-compact' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#0e0e10',
      }}
    >
      <header
        style={{
          minHeight: 42,
          padding: '6px 9px',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          borderBottom: '1px solid rgba(255,255,255,0.10)',
          background: '#18181b',
          color: '#efeff1',
          flexShrink: 0,
        }}
      >
        <strong style={{ fontSize: 13 }}>Chat</strong>
        <span
          style={{
            minWidth: 0,
            marginRight: 'auto',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#adadb8',
            fontSize: 11,
          }}
          title={`#${channel}`}
        >
          #{channel}
        </span>
        <ChatModeSwitch
          mode="twitch"
          onUseNative={onUseNative}
          onUseTwitch={() => {}}
        />
      </header>

      <div
        role="note"
        className="twitch-embedded-mod-guidance"
        style={{
          flexShrink: 0,
          padding: '7px 9px',
          background: '#211c2b',
          color: '#ded5eb',
          fontSize: 11,
          lineHeight: 1.35,
          borderBottom: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <strong>Moderating?</strong> If embedded Twitch chat controls don't work,
        switch to Native for chatting. For bans, timeouts, and other mod actions,{' '}
        <a
          href={`https://www.twitch.tv/moderator/${encodeURIComponent(channel)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#c6a6ff', textDecoration: 'underline' }}
        >
          open Twitch Mod View
        </a>.
      </div>
      <div
        style={{ flex: '1 1 auto', minHeight: 0 }}
        onPointerDownCapture={() => onActivity?.({ type: 'twitch_iframe_pointer', channel })}
      >
        <iframe
          ref={iframeRef}
          title={`${channel} chat`}
          src={src}
          allow="clipboard-write"
          style={{
            width: '100%',
            height: '100%',
            border: 0,
            display: 'block',
          }}
        />
      </div>
    </section>
  );
}

function statusCopy(status) {
  if (status === 'preparing') return 'Preparing native Twitch chat…';
  if (status === 'connecting') return 'Connecting to live Twitch chat…';
  if (status === 'subscribing') return 'Joining live Twitch chat…';
  if (status === 'reconnecting') return 'Reconnecting to Twitch chat…';
  return 'Live messages will appear here.';
}

export default function ChatPanel({ channel, compact = false, mentionCandidates = [], onActivity }) {
  const [nativeEnabled, setNativeEnabled] = useState(null);
  const [readerAuthorized, setReaderAuthorized] = useState(null);
  const nativeModeRef = useRef(false);
  const [status, setStatus] = useState('resolving');
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [broadcaster, setBroadcaster] = useState(null);
  const [badgeCatalogs, setBadgeCatalogs] = useState(null);
  const [draft, setDraft] = useState('');
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState('');
  const [emotePickerOpen, setEmotePickerOpen] = useState(false);
  const [emoteStatus, setEmoteStatus] = useState('idle');
  const [emoteError, setEmoteError] = useState('');
  const [emoteErrorCode, setEmoteErrorCode] = useState('');
  const [emotes, setEmotes] = useState([]);
  const [emoteSearch, setEmoteSearch] = useState('');
  const [animatePickerEmotes, setAnimatePickerEmotes] = useState(() => (
    typeof window === 'undefined' || !window.matchMedia ||
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));
  const [composerCursor, setComposerCursor] = useState(0);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const composerRef = useRef(null);
  const endRef = useRef(null);
  const draftLoadedChannelRef = useRef('');
  const restoredDraftNeedsFocusRef = useRef(false);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setAnimatePickerEmotes(!preference.matches);
    update();
    preference.addEventListener?.('change', update);
    return () => preference.removeEventListener?.('change', update);
  }, []);

  const normalizedChannel = useMemo(
    () => String(channel || '').trim().toLowerCase(),
    [channel],
  );

  // Keep exactly one live EventSub reader for the selected channel when the
  // viewer is authenticated, even while the Twitch iframe is selected.
  // This uses the existing Twitch user connection, not a new backend or DB.
  nativeModeRef.current = nativeEnabled === true;
  useEffect(() => {
    if (!supabase) {
      setReaderAuthorized(false);
      return undefined;
    }
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (active) setReaderAuthorized(Boolean(session?.user?.id));
      },
    );
    void supabase.auth.getSession()
      .then(({ data }) => { if (active) setReaderAuthorized(Boolean(data?.session?.user?.id)); })
      .catch(() => { if (active) setReaderAuthorized(false); });
    return () => {
      active = false;
      subscription?.unsubscribe?.();
    };
  }, []);

  // Visitors who aren't signed in can still choose Twitch embedded chat.
  // A visitor explicitly opening Native gets the existing sign-in error.
  const shouldCaptureNativeChat = Boolean(normalizedChannel) && (
    readerAuthorized === true ||
    (readerAuthorized === false && nativeEnabled === true)
  );

  const mentionUsers = useMemo(() => {
    const users = [];
    const seen = new Set();

    const addUser = (loginValue, displayValue = '') => {
      const login = String(loginValue || '').trim().toLowerCase();
      if (!login || seen.has(login)) return;
      seen.add(login);
      users.push({
        login,
        displayName: String(displayValue || login).trim() || login,
      });
    };

    // Recent chatters are the most useful @ targets, so keep them first.
    [...messages].reverse().forEach((message) => {
      addUser(message?.chatterLogin, message?.chatterName);
    });

    addUser(broadcaster?.login || normalizedChannel, broadcaster?.display_name || normalizedChannel);

    // Also include the current Squad creators. This makes it possible to type
    // @ and quickly pick another streamer even before they have spoken in chat.
    (Array.isArray(mentionCandidates) ? mentionCandidates : []).forEach((candidate) => {
      addUser(candidate, candidate);
    });

    return users;
  }, [messages, broadcaster?.login, broadcaster?.display_name, normalizedChannel, mentionCandidates]);

  const mentionContext = useMemo(() => {
    const cursor = Math.max(0, Math.min(Number(composerCursor) || 0, draft.length));
    const beforeCursor = draft.slice(0, cursor);
    const match = beforeCursor.match(/(^|\s)@([A-Za-z0-9_]{0,25})$/);
    if (!match) return null;

    const query = String(match[2] || '').toLowerCase();
    return {
      cursor,
      query,
      start: Math.max(0, cursor - query.length - 1),
    };
  }, [draft, composerCursor]);

  const mentionSuggestions = useMemo(() => {
    if (!mentionContext) return [];
    const query = mentionContext.query;
    return mentionUsers
      .filter((user) => (
        !query ||
        user.login.includes(query) ||
        user.displayName.toLowerCase().includes(query)
      ))
      .slice(0, 6);
  }, [mentionContext, mentionUsers]);

  useEffect(() => {
    setMentionActiveIndex(0);
  }, [mentionContext?.query, mentionSuggestions.length]);

  useEffect(() => {
    let cancelled = false;

    void shouldUseNativeTwitchChat().then((enabled) => {
      if (cancelled) return;

      setNativeEnabled(enabled);
      setStatus(enabled ? 'preparing' : 'iframe');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Channel-local drafts and visible history should reset only when the selected
  // stream changes, not whenever Native/Twitch tabs are swapped.
  useEffect(() => {
    if (!normalizedChannel) return;
    setMessages(readNativeChatHistory(normalizedChannel));
    setBroadcaster(null);
    const restoredDraft = readNativeChatDraft(normalizedChannel);
    draftLoadedChannelRef.current = normalizedChannel;
    restoredDraftNeedsFocusRef.current = Boolean(restoredDraft);
    setDraft(restoredDraft);
    setComposerCursor(restoredDraft.length);
    setMentionActiveIndex(0);
    setSendError('');
    setEmotePickerOpen(false);
    setEmoteSearch('');
    setEmoteError('');
    setEmoteErrorCode('');
    setError('');
    setStatus('preparing');
  }, [normalizedChannel]);

  // The badge catalog is channel-specific artwork, not a guess based on
  // someone's status. Each chat message carries its own badge IDs.
  useEffect(() => {
    if (!broadcaster?.id) {
      setBadgeCatalogs(null);
      return undefined;
    }
    const broadcasterId = String(broadcaster.id);
    const cached = nativeBadgeCatalogCache.get(broadcasterId);
    if (cached && Date.now() - cached.savedAt < BADGE_CATALOG_TTL_MS) {
      setBadgeCatalogs(cached.catalogs);
      return undefined;
    }
    let cancelled = false;
    setBadgeCatalogs(null);
    void loadNativeTwitchChatBadges({ broadcasterUserId: broadcasterId })
      .then((response) => {
        if (cancelled) return;
        const catalogs = response?.badges || null;
        if (!catalogs) return;
        nativeBadgeCatalogCache.set(broadcasterId, { catalogs, savedAt: Date.now() });
        while (nativeBadgeCatalogCache.size > 8) {
          nativeBadgeCatalogCache.delete(nativeBadgeCatalogCache.keys().next().value);
        }
        setBadgeCatalogs(catalogs);
      })
      .catch(() => {
        // Badges are optional; a stale or un-deployed function must not break
        // messages, emotes, drafts, or the continuous chat reader.
        if (!cancelled) setBadgeCatalogs(null);
      });
    return () => { cancelled = true; };
  }, [broadcaster?.id]);

  // The Twitch iframe never owns this connection: switching tabs must not
  // disconnect the reader and create gaps in the short-lived local history.
  useEffect(() => {
    if (!shouldCaptureNativeChat) return undefined;
    setStatus('preparing');
    setError('');
    const controller = createNativeTwitchChat({
      channel: normalizedChannel,
      onStatus(nextStatus, details) {
        setStatus(nextStatus);
        if (details?.broadcaster?.id) setBroadcaster(details.broadcaster);
      },
      onMessage(message) {
        const current = readNativeChatHistory(normalizedChannel);
        if (message?.id && current.some((entry) => entry.id === message.id)) return;
        const next = [...current, { ...message, receivedAt: Date.now() }].slice(-MAX_NATIVE_MESSAGES);
        const retained = saveNativeChatHistory(normalizedChannel, next);
        // Avoid repainting the full Twitch iframe for every message while it
        // is selected; native history remains live and is read when returning.
        if (nativeModeRef.current) setMessages(retained);
      },
      onError(nextError) {
        setError(nextError?.message || 'Native Twitch chat could not connect.');
        setStatus('error');
      },
    });
    return () => {
      const cached = recentNativeChatHistory.get(normalizedChannel);
      if (cached) saveNativeChatHistory(normalizedChannel, cached.messages, true);
      controller.close();
    };
  }, [shouldCaptureNativeChat, normalizedChannel]);

  // Native mode may have been hidden for several minutes. On return use the
  // actively collected cache rather than only the messages last rendered.
  useEffect(() => {
    if (nativeEnabled === true && normalizedChannel) {
      setMessages(readNativeChatHistory(normalizedChannel));
    }
  }, [nativeEnabled, normalizedChannel]);

  useEffect(() => {
    if (!normalizedChannel || draftLoadedChannelRef.current !== normalizedChannel) return;
    writeNativeChatDraft(normalizedChannel, draft);
  }, [draft, normalizedChannel]);

  useEffect(() => {
    if (
      nativeEnabled !== true ||
      status !== 'ready' ||
      !restoredDraftNeedsFocusRef.current ||
      !draft
    ) {
      return;
    }

    restoredDraftNeedsFocusRef.current = false;
    window.requestAnimationFrame(() => {
      const input = composerRef.current;
      input?.focus?.({ preventScroll: true });
      input?.setSelectionRange?.(draft.length, draft.length);
    });
  }, [draft, nativeEnabled, status]);

  useEffect(() => {
    if (nativeEnabled !== true || !normalizedChannel) return undefined;
    const prune = () => setMessages((current) => {
      const recent = keepRecentNativeMessages(current);
      if (recent.length === current.length) return current;
      return saveNativeChatHistory(normalizedChannel, recent, true);
    });
    const interval = window.setInterval(prune, 30000);
    return () => window.clearInterval(interval);
  }, [nativeEnabled, normalizedChannel]);

  useEffect(() => {
    if (!nativeEnabled || !messages.length) return;

    endRef.current?.scrollIntoView({
      block: 'end',
      behavior: 'auto',
    });
  }, [messages, nativeEnabled]);

  useEffect(() => {
    if (
      nativeEnabled !== true ||
      !emotePickerOpen ||
      !broadcaster?.id
    ) {
      return undefined;
    }

    let cancelled = false;
    const cacheKey = String(broadcaster.id);

    const cached = emoteCache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < (cached.hasMissingOwners ? 20000 : 5 * 60 * 1000)) {
      setEmotes(cached.emotes);
      setEmoteStatus('ready');
      setEmoteError('');
      setEmoteErrorCode('');
      return undefined;
    }

    setEmoteStatus('loading');
    setEmoteError('');
    setEmoteErrorCode('');

    void loadNativeTwitchChatEmotes({
      broadcasterUserId: broadcaster.id,
    })
      .then((result) => {
        if (cancelled) return;

        const available = Array.isArray(result?.emotes)
          ? result.emotes
          : [];

        emoteCache.set(cacheKey, {
          emotes: available,
          savedAt: Date.now(),
          hasMissingOwners: available.some((emote) => emote?.owner_id && emote.owner_id !== '0' && !emote.owner_name && !emote.owner_login),
        });
        setEmotes(available);
        setEmoteStatus('ready');
      })
      .catch((nextError) => {
        if (cancelled) return;

        setEmotes([]);
        setEmoteStatus('error');
        setEmoteErrorCode(String(nextError?.code || ''));
        setEmoteError(
          nextError?.message ||
          'Twitch emotes could not be loaded.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    nativeEnabled,
    emotePickerOpen,
    broadcaster?.id,
  ]);

  const filteredEmotes = useMemo(() => {
    const query = emoteSearch.trim().toLowerCase();
    if (!query) return emotes;

    return emotes.filter((emote) =>
      [emote?.name, emote?.owner_name, emote?.owner_login]
        .some((value) => String(value || '').toLowerCase().includes(query))
    );
  }, [emotes, emoteSearch]);

  const emoteSections = useMemo(
    () => buildNativeEmoteSections(
      filteredEmotes,
      normalizedChannel,
      String(broadcaster?.id || '').trim(),
    ),
    [filteredEmotes, normalizedChannel, broadcaster?.id],
  );

  const switchToTwitchChat = () => {
    disableNativeTwitchChat();
    setNativeEnabled(false);
    setError('');
    setEmotePickerOpen(false);
  };

  const switchToNativeChat = () => {
    enableNativeTwitchChat();
    setNativeEnabled(true);
    // Keep the existing live subscription and its ready/reconnect status.
    setError('');
  };

  const insertEmote = (nameValue) => {
    const name = String(nameValue || '').trim();
    if (!name) return;

    const input = composerRef.current;
    const start = Number.isFinite(input?.selectionStart)
      ? input.selectionStart
      : draft.length;
    const end = Number.isFinite(input?.selectionEnd)
      ? input.selectionEnd
      : start;

    const before = draft.slice(0, start);
    const after = draft.slice(end);
    const prefix = before && !/\s$/.test(before) ? ' ' : '';
    const suffix = after && !/^\s/.test(after) ? ' ' : ' ';
    const token = `${prefix}${name}${suffix}`;
    const next = `${before}${token}${after}`.slice(0, 500);
    const cursor = Math.min(
      next.length,
      before.length + token.length,
    );

    setDraft(next);
    setComposerCursor(cursor);
    setSendError('');
    onActivity?.({ type: 'native_input', channel: normalizedChannel });

    window.requestAnimationFrame(() => {
      input?.focus?.();
      input?.setSelectionRange?.(cursor, cursor);
    });
  };

  const insertMention = (loginValue) => {
    const login = String(loginValue || '').trim().replace(/^@+/, '').toLowerCase();
    if (!login) return;

    const input = composerRef.current;
    const cursor = Math.max(0, Math.min(
      Number.isFinite(input?.selectionStart) ? input.selectionStart : composerCursor,
      draft.length,
    ));
    const end = Math.max(cursor, Math.min(
      Number.isFinite(input?.selectionEnd) ? input.selectionEnd : cursor,
      draft.length,
    ));
    const context = mentionContext && mentionContext.cursor === cursor
      ? mentionContext
      : null;
    const start = context ? context.start : cursor;
    const before = draft.slice(0, start);
    const after = draft.slice(context ? cursor : end);
    const prefix = context || !before || /\s$/.test(before) ? '' : ' ';
    const suffix = after && /^\s/.test(after) ? '' : ' ';
    const token = `${prefix}@${login}${suffix}`;
    const next = `${before}${token}${after}`.slice(0, 500);
    const nextCursor = Math.min(next.length, before.length + token.length);

    setDraft(next);
    setComposerCursor(nextCursor);
    setMentionActiveIndex(0);
    setSendError('');
    onActivity?.({ type: 'native_input', channel: normalizedChannel });

    window.requestAnimationFrame(() => {
      input?.focus?.();
      input?.setSelectionRange?.(nextCursor, nextCursor);
    });
  };

  if (nativeEnabled === null) {
    return (
      <section
        className={`chat-panel ${compact ? 'is-compact' : ''}`}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 0,
          display: 'grid',
          placeItems: 'center',
          background: '#0e0e10',
          color: '#adadb8',
          fontSize: compact ? 11 : 12,
        }}
      >
        Loading chat…
      </section>
    );
  }

  if (!nativeEnabled) {
    return (
      <IframeChat
        channel={normalizedChannel || channel}
        compact={compact}
        onUseNative={switchToNativeChat}
        onActivity={onActivity}
      />
    );
  }

  const useIframeFallback = switchToTwitchChat;

  return (
    <section
      className={`chat-panel native-twitch-chat ${compact ? 'is-compact' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        background: '#0e0e10',
        color: '#efeff1',
      }}
    >
      <header
        style={{
          minHeight: 42,
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid rgba(255,255,255,0.10)',
          background: '#18181b',
          flexShrink: 0,
        }}
      >
        <strong style={{ fontSize: 13 }}>Chat</strong>
        <span
          style={{
            marginLeft: 'auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 11,
            color: '#adadb8',
          }}
          title={`#${normalizedChannel}`}
        >
          #{normalizedChannel}
        </span>
        <ChatModeSwitch
          mode="native"
          onUseNative={() => {}}
          onUseTwitch={switchToTwitchChat}
        />
      </header>

      <div
        role="log"
        aria-live="polite"
        aria-label={`${normalizedChannel} live Twitch chat`}
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          padding: '9px 10px 12px',
          fontSize: compact ? 11 : 12,
          lineHeight: 1.45,
          overscrollBehavior: 'contain',
        }}
      >
        {error ? (
          <div
            style={{
              padding: 10,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
              color: '#dedee3',
            }}
          >
            <strong style={{ display: 'block', marginBottom: 5 }}>
              Native chat could not connect
            </strong>
            <span>{error}</span>
            <button
              type="button"
              onClick={useIframeFallback}
              style={{
                display: 'block',
                marginTop: 10,
                border: 0,
                borderRadius: 6,
                padding: '7px 9px',
                background: '#9147ff',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Use Twitch chat instead
            </button>
          </div>
        ) : (
          <>
            {!messages.length && (
              <div
                style={{
                  padding: '12px 4px',
                  color: '#adadb8',
                  textAlign: 'center',
                }}
              >
                {statusCopy(status)}
                <div style={{ marginTop: 5, fontSize: 10 }}>
                  Native chat starts live. Up to 10 minutes of messages seen in this tab are retained.
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id || `${message.chatterLogin}:${message.sentAt}:${message.text}`}
                style={{
                  padding: '2px 0',
                  overflowWrap: 'anywhere',
                }}
              >
                <NativeChatBadges badges={message.badges} catalogs={badgeCatalogs} />
                <button
                  type="button"
                  className="native-chat-username"
                  onClick={() => insertMention(message.chatterLogin || message.chatterName)}
                  title={`Mention @${message.chatterLogin || message.chatterName || 'viewer'}`}
                  style={{ color: message.color || '#bf94ff' }}
                >
                  {message.chatterName || message.chatterLogin || 'viewer'}
                </button>
                <span style={{ color: '#adadb8' }}>:</span>{' '}
                <span><ChatMessageBody message={message} /></span>
              </div>
            ))}
            <div ref={endRef} />
          </>
        )}
      </div>

      {emotePickerOpen && (
        <section
          className="native-chat-emote-picker"
          aria-label="Twitch emote picker"
          style={{
            flexShrink: 0,
            maxHeight: 230,
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            padding: '8px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: '#18181b',
          }}
        >
          <div className="native-chat-emote-picker-header">
            <strong>Emotes</strong>
            <button
              type="button"
              className="native-chat-emote-picker-close"
              onClick={() => setEmotePickerOpen(false)}
              aria-label="Close Twitch emote picker"
              title="Close emotes"
            >
              ×
            </button>
          </div>

          <input
            type="search"
            value={emoteSearch}
            onChange={(event) => setEmoteSearch(event.target.value)}
            placeholder="Search your Twitch emotes"
            aria-label="Search Twitch emotes"
            style={{
              width: '100%',
              minHeight: 38,
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: 6,
              background: '#0e0e10',
              color: '#efeff1',
              padding: '7px 9px',
              font: 'inherit',
              fontSize: 16,
            }}
          />

          {emoteStatus === 'loading' ? (
            <div style={{ padding: 8, color: '#adadb8', fontSize: 11 }}>
              Loading your Twitch emotes…
            </div>
          ) : emoteStatus === 'error' ? (
            <div
              style={{
                display: 'grid',
                gap: 7,
                padding: 8,
                borderRadius: 7,
                background: 'rgba(255,255,255,0.05)',
                color: '#dedee3',
                fontSize: 11,
              }}
            >
              <span>{emoteError}</span>
              {emoteErrorCode === 'twitch_emote_scope_required' && (
                <button
                  type="button"
                  onClick={() => {
                    void signInWithTwitch({ forceVerify: true });
                  }}
                  style={{
                    minHeight: 38,
                    border: 0,
                    borderRadius: 6,
                    background: '#9147ff',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Reconnect Twitch for emotes
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                minHeight: 0,
                overflowY: 'auto',
                display: 'grid',
                gap: 10,
                padding: '1px 0 4px',
                overscrollBehavior: 'contain',
              }}
            >
              {emoteSections.map((section) => (
                <section
                  key={section.key}
                  aria-label={section.label}
                  style={{
                    display: 'grid',
                    gap: 5,
                  }}
                >
                  <div
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                      padding: '4px 3px',
                      background: '#18181b',
                      color: section.key === 'current-channel'
                        ? '#bf94ff'
                        : '#adadb8',
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '0.01em',
                    }}
                  >
                    {section.label}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(42px, 1fr))',
                      gap: 5,
                    }}
                  >
                    {section.emotes.map((emote) => (
                      <button
                        type="button"
                        key={emote.id}
                        onClick={() => insertEmote(emote.name)}
                        title={`${emote.name} · ${section.label}`}
                        aria-label={`Insert ${emote.name} from ${section.label}`}
                        style={{
                          minHeight: 44,
                          border: emote.is_channel_emote
                            ? '1px solid rgba(145,71,255,0.55)'
                            : '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 6,
                          background: '#0e0e10',
                          display: 'grid',
                          placeItems: 'center',
                          cursor: 'pointer',
                          padding: 4,
                        }}
                      >
                        {emote.image_url ? (
                          <img
                            src={nativePickerEmoteUrl(emote, animatePickerEmotes)}
                             onError={(event) => {
                               if (event.currentTarget.src !== emote.image_url) {
                                 event.currentTarget.src = emote.image_url;
                               }
                             }}
                            alt={emote.name}
                            loading="lazy"
                            decoding="async"
                            fetchPriority="low"
                            style={{
                              width: 28,
                              height: 28,
                              objectFit: 'contain',
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              maxWidth: '100%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: '#efeff1',
                              fontSize: 9,
                            }}
                          >
                            {emote.name}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              ))}

              {emoteStatus === 'ready' && !filteredEmotes.length && (
                <div
                  style={{
                    padding: 8,
                    color: '#adadb8',
                    fontSize: 11,
                    textAlign: 'center',
                  }}
                >
                  No matching emotes.
                </div>
              )}
            </div>
          )}
        </section>
      )}


      {mentionSuggestions.length > 0 && (
        <div className="native-chat-mention-suggestions" role="listbox" aria-label="Mention a Twitch user">
          {mentionSuggestions.map((user, index) => (
            <button
              type="button"
              key={user.login}
              className={index === mentionActiveIndex ? 'is-active' : ''}
              role="option"
              aria-selected={index === mentionActiveIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertMention(user.login)}
            >
              <strong>@{user.login}</strong>
              {user.displayName.toLowerCase() !== user.login && <span>{user.displayName}</span>}
            </button>
          ))}
        </div>
      )}

      <div
        className="native-chat-composer"
        style={{
          padding: '9px 10px 8px',
          flexShrink: 0,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: '#18181b',
        }}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();

            const message = draft.trim();
            if (!message || sendBusy) return;

            onActivity?.({ type: 'native_send', channel: normalizedChannel });
            setSendBusy(true);
            setSendError('');
            let sentSuccessfully = false;

            try {
              await sendNativeTwitchChatMessage({
                broadcasterUserId: broadcaster?.id,
                message,
              });
              setDraft('');
              setComposerCursor(0);
              setMentionActiveIndex(0);
              sentSuccessfully = true;
            } catch (nextError) {
              setSendError(nextError?.message || 'Twitch could not send that message.');
            } finally {
              setSendBusy(false);
              if (sentSuccessfully) {
                // Twitch chat is conversational. After Enter/send, put focus
                // straight back in the native composer so the next message can
                // be typed without another click/tap. Waiting one frame lets
                // React remove the temporary disabled state first.
                window.requestAnimationFrame(() => {
                  const input = composerRef.current;
                  input?.focus?.({ preventScroll: true });
                  input?.setSelectionRange?.(0, 0);
                });
              }
            }
          }}
          style={{
            display: 'flex',
            gap: 7,
            alignItems: 'flex-end',
          }}
        >
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => {
              const next = event.target.value.slice(0, 500);
              setDraft(next);
              setComposerCursor(Math.min(event.target.selectionStart ?? next.length, next.length));
              onActivity?.({ type: 'native_input', channel: normalizedChannel });
            }}
            onSelect={(event) => {
              setComposerCursor(event.currentTarget.selectionStart ?? draft.length);
            }}
            onFocus={(event) => {
              // Keep the bottom composer visible when the software keyboard
              // opens. The 16px font also avoids iOS Safari input zoom.
              window.setTimeout(() => {
                event.currentTarget?.scrollIntoView?.({
                  block: 'nearest',
                  inline: 'nearest',
                  behavior: 'auto',
                });
              }, 50);
            }}
            onKeyDown={(event) => {
              if (mentionSuggestions.length && !event.nativeEvent?.isComposing) {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setMentionActiveIndex((current) => (current + 1) % mentionSuggestions.length);
                  return;
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setMentionActiveIndex((current) => (current - 1 + mentionSuggestions.length) % mentionSuggestions.length);
                  return;
                }
                if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
                  event.preventDefault();
                  insertMention(mentionSuggestions[Math.min(mentionActiveIndex, mentionSuggestions.length - 1)]?.login);
                  return;
                }
              }

              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent?.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              broadcaster?.id
                ? `Chat as your Twitch account`
                : 'Connecting to Twitch chat…'
            }
            disabled={!broadcaster?.id || sendBusy || status !== 'ready'}
            rows={2}
            maxLength={500}
            aria-label="Send a Twitch chat message"
            style={{
              flex: '1 1 auto',
              minWidth: 0,
              minHeight: 50,
              maxHeight: 96,
              resize: 'none',
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: 6,
              background: '#0e0e10',
              color: '#efeff1',
              padding: '8px 9px',
              font: 'inherit',
              fontSize: 16,
              lineHeight: 1.35,
              WebkitTextSizeAdjust: '100%',
              scrollMarginTop: 12,
            }}
          />
          <button
            type="button"
            aria-label="Switch to Twitch chat for Channel Points rewards"
            title="Use Channel Points in Twitch chat"
            onClick={switchToTwitchChat}
            style={{
              width: 48,
              minWidth: 48,
              height: 44,
              padding: '3px 2px',
              border: '1px solid rgba(145,71,255,0.52)',
              borderRadius: 6,
              background: '#302241',
              color: '#e8dbff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 0,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>◇</span>
            <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.2 }}>Points</span>
          </button>
          <button
            type="button"
            aria-label="Open Twitch emote picker"
            aria-expanded={emotePickerOpen}
            title="Twitch emotes"
            disabled={!broadcaster?.id || status !== 'ready'}
            onClick={() => setEmotePickerOpen((open) => !open)}
            style={{
              width: 44,
              minWidth: 44,
              height: 44,
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: 6,
              background: emotePickerOpen ? '#3b2066' : '#26262c',
              color: '#efeff1',
              fontSize: 20,
              lineHeight: 1,
              cursor: 'pointer',
              opacity:
                !broadcaster?.id || status !== 'ready'
                  ? 0.5
                  : 1,
            }}
          >
            ☺
          </button>

          <button
            type="submit"
            disabled={
              !broadcaster?.id ||
              status !== 'ready' ||
              sendBusy ||
              !draft.trim()
            }
            style={{
              minHeight: 36,
              border: 0,
              borderRadius: 6,
              padding: '0 12px',
              background: '#9147ff',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              opacity:
                !broadcaster?.id ||
                status !== 'ready' ||
                sendBusy ||
                !draft.trim()
                  ? 0.55
                  : 1,
            }}
          >
            {sendBusy ? 'Sending…' : 'Chat'}
          </button>
        </form>

        <div
          style={{
            minHeight: 16,
            marginTop: 4,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            color: sendError ? '#ff8280' : '#adadb8',
            fontSize: 10,
          }}
        >
          <span>{sendError || 'Enter to send · Shift+Enter for a new line'}</span>
          <span>{draft.length}/500</span>
        </div>
      </div>



    </section>
  );
}
