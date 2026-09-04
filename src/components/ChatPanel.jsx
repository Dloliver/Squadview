import { useEffect, useMemo, useRef, useState } from 'react';
import { signInWithTwitch } from '../services/accountService';
import {
  createNativeTwitchChat,
  disableNativeTwitchChat,
  enableNativeTwitchChat,
  loadNativeTwitchChatEmotes,
  sendNativeTwitchChatMessage,
  shouldUseNativeTwitchChat,
} from '../services/twitchNativeChatService';

const MAX_NATIVE_MESSAGES = 250;
const emoteCache = new Map();
const NATIVE_CHAT_TEXT_SIZE_KEY = 'squadview:native-chat-text-size:v1';
const NATIVE_CHAT_TEXT_SIZE_ORDER = ['default', 'large', 'xlarge'];
// Phase 2.4: persistent native chat text-size control.

function readNativeChatTextSize() {
  if (typeof window === 'undefined') return 'default';

  try {
    const saved = window.localStorage.getItem(NATIVE_CHAT_TEXT_SIZE_KEY);
    return NATIVE_CHAT_TEXT_SIZE_ORDER.includes(saved) ? saved : 'default';
  } catch {
    return 'default';
  }
}

function nativeChatTextScale(sizeKey, compact) {
  if (sizeKey === 'xlarge') {
    return {
      key: 'xlarge',
      label: 'Extra large',
      shortLabel: 'Aa++',
      messageFontSize: compact ? 16 : 18,
      composerFontSize: 20,
      lineHeight: 1.5,
    };
  }

  if (sizeKey === 'large') {
    return {
      key: 'large',
      label: 'Large',
      shortLabel: 'Aa+',
      messageFontSize: compact ? 13 : 15,
      composerFontSize: 18,
      lineHeight: 1.48,
    };
  }

  return {
    key: 'default',
    label: 'Default',
    shortLabel: 'Aa',
    messageFontSize: compact ? 11 : 12,
    composerFontSize: 16,
    lineHeight: 1.45,
  };
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
}) {
  const parent = window.location.hostname;
  const src = `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?parent=${encodeURIComponent(parent)}&darkpopout`;

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

      <div style={{ flex: '1 1 auto', minHeight: 0 }}>
        <iframe
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

export default function ChatPanel({ channel, compact = false }) {
  const [nativeEnabled, setNativeEnabled] = useState(null);
  const [status, setStatus] = useState('resolving');
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [broadcaster, setBroadcaster] = useState(null);
  const [draft, setDraft] = useState('');
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState('');
  const [emotePickerOpen, setEmotePickerOpen] = useState(false);
  const [emoteStatus, setEmoteStatus] = useState('idle');
  const [emoteError, setEmoteError] = useState('');
  const [emoteErrorCode, setEmoteErrorCode] = useState('');
  const [emotes, setEmotes] = useState([]);
  const [emoteSearch, setEmoteSearch] = useState('');
  const [nativeChatTextSize, setNativeChatTextSize] = useState(readNativeChatTextSize);
  const composerRef = useRef(null);
  const endRef = useRef(null);

  const normalizedChannel = useMemo(
    () => String(channel || '').trim().toLowerCase(),
    [channel],
  );

  const textScale = useMemo(
    () => nativeChatTextScale(nativeChatTextSize, compact),
    [nativeChatTextSize, compact],
  );

  function cycleNativeChatTextSize() {
    setNativeChatTextSize((current) => {
      const currentIndex = Math.max(0, NATIVE_CHAT_TEXT_SIZE_ORDER.indexOf(current));
      const next =
        NATIVE_CHAT_TEXT_SIZE_ORDER[
          (currentIndex + 1) % NATIVE_CHAT_TEXT_SIZE_ORDER.length
        ];

      try {
        window.localStorage.setItem(NATIVE_CHAT_TEXT_SIZE_KEY, next);
      } catch {
        // Restricted storage should not block text-size changes.
      }

      return next;
    });
  }

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

  useEffect(() => {
    if (nativeEnabled !== true || !normalizedChannel) return undefined;

    setMessages([]);
    setBroadcaster(null);
    setDraft('');
    setSendError('');
    setEmotePickerOpen(false);
    setEmoteSearch('');
    setEmoteError('');
    setEmoteErrorCode('');
    setError('');
    setStatus('preparing');

    const controller = createNativeTwitchChat({
      channel: normalizedChannel,
      onStatus(nextStatus, details) {
        setStatus(nextStatus);
        if (details?.broadcaster?.id) {
          setBroadcaster(details.broadcaster);
        }
      },
      onMessage(message) {
        setMessages((current) => {
          const next = [...current, message];

          return next.length > MAX_NATIVE_MESSAGES
            ? next.slice(next.length - MAX_NATIVE_MESSAGES)
            : next;
        });
      },
      onError(nextError) {
        setError(nextError?.message || 'Native Twitch chat could not connect.');
        setStatus('error');
      },
    });

    return () => {
      controller.close();
    };
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
    if (cached) {
      setEmotes(cached);
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

        emoteCache.set(cacheKey, available);
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
      String(emote?.name || '').toLowerCase().includes(query)
    );
  }, [emotes, emoteSearch]);

  const emoteSections = useMemo(() => {
    const sections = [];
    const sectionMap = new Map();

    const pushToSection = (key, label, emote) => {
      let section = sectionMap.get(key);

      if (!section) {
        section = {
          key,
          label,
          emotes: [],
        };
        sectionMap.set(key, section);
        sections.push(section);
      }

      section.emotes.push(emote);
    };

    for (const emote of filteredEmotes) {
      const type = String(emote?.emote_type || '').toLowerCase();
      const ownerId = String(emote?.owner_id || '').trim();

      if (emote?.is_channel_emote) {
        pushToSection(
          'current-channel',
          `Current channel · #${normalizedChannel}`,
          emote,
        );
        continue;
      }

      if (
        ownerId &&
        ['subscriptions', 'follower', 'bitstier', 'channelpoints'].includes(type)
      ) {
        const ownerLabel =
          String(emote?.owner_name || emote?.owner_login || '').trim() ||
          'Channel emotes';

        pushToSection(
          `owner:${ownerId}`,
          ownerLabel,
          emote,
        );
        continue;
      }

      if (
        ['globals', 'smilies', 'none'].includes(type) ||
        (!ownerId && !type)
      ) {
        pushToSection(
          'twitch-global',
          'Twitch global',
          emote,
        );
        continue;
      }

      pushToSection(
        'unlocked',
        'Unlocked emotes',
        emote,
      );
    }

    return sections;
  }, [filteredEmotes, normalizedChannel]);

  const switchToTwitchChat = () => {
    disableNativeTwitchChat();
    setNativeEnabled(false);
    setStatus('iframe');
    setError('');
    setEmotePickerOpen(false);
  };

  const switchToNativeChat = () => {
    enableNativeTwitchChat();
    setNativeEnabled(true);
    setStatus('preparing');
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
    setSendError('');

    window.requestAnimationFrame(() => {
      input?.focus?.();
      input?.setSelectionRange?.(cursor, cursor);
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
        <button
          type="button"
          onClick={cycleNativeChatTextSize}
          aria-label={`Native chat text size: ${textScale.label}. Change text size`}
          title={`Chat text: ${textScale.label}`}
          style={{
            minHeight: 32,
            minWidth: 38,
            border: '1px solid rgba(255,255,255,0.16)',
            background: '#26262c',
            color: '#efeff1',
            borderRadius: 6,
            padding: '5px 7px',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {textScale.shortLabel}
        </button>
        <ChatModeSwitch
          mode="native"
          onUseNative={() => {}}
          onUseTwitch={switchToTwitchChat}
        />
      </header>

      <div
        className="native-chat-composer"
        style={{
          padding: '9px 10px 8px',
          flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: '#18181b',
        }}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();

            const message = draft.trim();
            if (!message || sendBusy) return;

            setSendBusy(true);
            setSendError('');

            try {
              await sendNativeTwitchChatMessage({
                broadcasterUserId: broadcaster?.id,
                message,
              });
              setDraft('');
            } catch (nextError) {
              setSendError(nextError?.message || 'Twitch could not send that message.');
            } finally {
              setSendBusy(false);
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
            onChange={(event) => setDraft(event.target.value.slice(0, 500))}
            onFocus={(event) => {
              // iOS Safari can scroll/zoom the whole page to reveal a small
              // bottom input. Keeping the composer at the top of the chat
              // panel plus a 16px font avoids the automatic zoom path.
              window.setTimeout(() => {
                event.currentTarget?.scrollIntoView?.({
                  block: 'nearest',
                  inline: 'nearest',
                  behavior: 'auto',
                });
              }, 50);
            }}
            onKeyDown={(event) => {
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
              fontSize: textScale.composerFontSize,
              lineHeight: 1.35,
              WebkitTextSizeAdjust: '100%',
              scrollMarginTop: 12,
            }}
          />
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

      {emotePickerOpen && (
        <section
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
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.02em',
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
                        title={emote.name}
                        aria-label={`Insert ${emote.name}`}
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
                            src={emote.image_url}
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

      <div
        role="log"
        aria-live="polite"
        aria-label={`${normalizedChannel} live Twitch chat`}
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          padding: '9px 10px 88px',
          fontSize: textScale.messageFontSize,
          lineHeight: textScale.lineHeight,
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
                  Native chat starts live and does not load earlier messages.
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
                <span
                  style={{
                    fontWeight: 700,
                    color: message.color || '#bf94ff',
                  }}
                >
                  {message.chatterName || message.chatterLogin || 'viewer'}
                </span>
                <span style={{ color: '#adadb8' }}>:</span>{' '}
                <span><ChatMessageBody message={message} /></span>
              </div>
            ))}
            <div ref={endRef} />
          </>
        )}
      </div>

    </section>
  );
}
