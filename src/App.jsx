import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TwitchPlayer from './components/TwitchPlayer';
import ChatPanel from './components/ChatPanel';
import LoadingAd from './components/LoadingAd';
import HomeAdSlot from './components/ads/HomeAdSlot';
import FooterAdSlot from './components/ads/FooterAdSlot';
import SiteFooter from './components/legal/SiteFooter';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import SupportPage from './pages/SupportPage';
import { markLoadingAdShown, shouldShowLoadingAd } from './config/advertising';
import { getStreamCountBucket, trackEvent } from './analytics/dataLayer';

function Icon({ symbol, className = '' }) {
  return <span className={`text-icon ${className}`} aria-hidden="true">{symbol}</span>;
}
const ArrowLeft = () => <Icon symbol="←" />;
const Heart = () => <Icon symbol="♡" />;
const FilledHeart = () => <Icon symbol="♥" />;
const Maximize2 = () => <Icon symbol="⛶" />;
const Menu = () => <Icon symbol="☰" />;
const Radio = () => <Icon symbol="◉" />;
const Save = () => <Icon symbol="☆" />;
const Share2 = () => <Icon symbol="↗" />;
const Sparkles = () => <Icon symbol="✦" />;
const Trash2 = () => <Icon symbol="×" />;
const X = () => <Icon symbol="×" />;

const FAVORITE_STREAMERS_KEY = 'squadview:favorite-streamers:v2';
const LEGACY_FAVORITES_KEY = 'squadview:favorites:v1';
const LAST_CHANNELS_KEY = 'squadview:last-channels:v1';
const LIVE_STATUS_API_URL = (import.meta.env.VITE_LIVE_STATUS_API_URL || '').replace(/\/$/, '');

function readFavoriteStreamers() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITE_STREAMERS_KEY) || '[]');
    if (Array.isArray(saved) && saved.length) {
      return [...new Set(saved.map(cleanChannel).filter(Boolean))];
    }

    // Preserve channels from the previous saved-group format the first time
    // this version runs, then store them as individual favorite streamers.
    const legacyGroups = JSON.parse(localStorage.getItem(LEGACY_FAVORITES_KEY) || '[]');
    const migrated = [...new Set(legacyGroups.flatMap((group) => group?.channels || []).map(cleanChannel).filter(Boolean))];
    if (migrated.length) {
      localStorage.setItem(FAVORITE_STREAMERS_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    return [];
  }
}

function cleanChannel(value) {
  return value.trim().replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

function SquadViewApp() {
  const [screen, setScreen] = useState('home');
  const [inputs, setInputs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_CHANNELS_KEY) || '[]');
      return [...saved, '', '', '', '', '', '', '', ''].slice(0, 8);
    } catch {
      return ['', '', '', ''];
    }
  });
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState('');
  const [favoriteStreamers, setFavoriteStreamers] = useState(readFavoriteStreamers);
  const [liveFavoriteStreamers, setLiveFavoriteStreamers] = useState(() => new Set());
  const [showEdit, setShowEdit] = useState(false);
  const [editInputs, setEditInputs] = useState(['', '', '', '', '', '', '', '']);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [viewMode, setViewMode] = useState('dual');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [slotChannels, setSlotChannels] = useState([]);
  const [desktopPage, setDesktopPage] = useState(0);
  const [isDesktopGrid, setIsDesktopGrid] = useState(() => window.matchMedia?.('(min-width: 1100px)').matches ?? false);
  const playersRef = useRef(new Map());
  const viewerSessionActiveRef = useRef(false);

  const registerPlayer = useCallback((channel, player) => {
    if (player) playersRef.current.set(channel, player);
    else playersRef.current.delete(channel);
  }, []);

  useEffect(() => {
    playersRef.current.forEach((player, channel) => {
      try {
        const shouldPlayAudio = audioEnabled && channel === activeChannel;
        player.setMuted(!shouldPlayAudio);
        player.setVolume(shouldPlayAudio ? 1 : 0);
      } catch {
        // A player may still be finishing initialization.
      }
    });
  }, [activeChannel, audioEnabled]);

  useEffect(() => {
    document.body.classList.toggle('viewer-active', screen === 'viewer');
    return () => document.body.classList.remove('viewer-active');
  }, [screen]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1100px)');
    const syncDesktopGrid = () => setIsDesktopGrid(media.matches);
    syncDesktopGrid();
    media.addEventListener?.('change', syncDesktopGrid);
    return () => media.removeEventListener?.('change', syncDesktopGrid);
  }, []);

  useEffect(() => {
    const captureInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const clearInstallPrompt = () => setInstallPrompt(null);

    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    window.addEventListener('appinstalled', clearInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
      window.removeEventListener('appinstalled', clearInstallPrompt);
    };
  }, []);

  useEffect(() => {
    const trackViewerExitOnPageLeave = () => {
      if (!viewerSessionActiveRef.current) return;
      viewerSessionActiveRef.current = false;
      trackEvent('viewer_exited', {
        stream_count_bucket: getStreamCountBucket(channels.length),
        exit_method: 'page_leave',
      });
    };

    window.addEventListener('pagehide', trackViewerExitOnPageLeave);
    return () => window.removeEventListener('pagehide', trackViewerExitOnPageLeave);
  }, [channels.length]);



  const validInputs = useMemo(() => inputs.map(cleanChannel).filter(Boolean), [inputs]);

  useEffect(() => {
    if (!LIVE_STATUS_API_URL || !favoriteStreamers.length) {
      setLiveFavoriteStreamers(new Set());
      return;
    }

    let cancelled = false;

    async function refreshFavoriteLiveStatus() {
      try {
        const url = new URL(LIVE_STATUS_API_URL);
        favoriteStreamers.forEach((streamer) => url.searchParams.append('login', streamer));

        const response = await fetch(url.toString(), {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) throw new Error(`Live status request failed with ${response.status}`);

        const result = await response.json();
        if (cancelled) return;

        const live = Array.isArray(result?.live)
          ? result.live.map(cleanChannel).filter(Boolean)
          : [];

        setLiveFavoriteStreamers(new Set(live));
      } catch (error) {
        if (!cancelled) setLiveFavoriteStreamers(new Set());
        if (import.meta.env.DEV) {
          console.info('[SquadView live status] unavailable', error);
        }
      }
    }

    refreshFavoriteLiveStatus();
    const interval = window.setInterval(refreshFavoriteLiveStatus, 3 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [favoriteStreamers]);


  function beginWatching(selected = validInputs) {
    const unique = [...new Set(selected)].slice(0, 8);
    if (!unique.length) return;
    setChannels(unique);
    setActiveChannel(unique[0]);
    setAudioEnabled(false);
    setViewMode('dual');
    setSlotChannels(unique.slice(0, 2));
    setDesktopPage(0);
    localStorage.setItem(LAST_CHANNELS_KEY, JSON.stringify(unique));
    viewerSessionActiveRef.current = true;
    trackEvent('viewer_started', {
      stream_count_bucket: getStreamCountBucket(unique.length),
    });
    if (shouldShowLoadingAd()) {
      markLoadingAdShown();
      setScreen('loading');
    } else {
      setScreen('viewer');
    }
  }


  function selectChannel(channel) {
    setActiveChannel(channel);
    setAudioEnabled(true);
    setDesktopPage(0);

    // A direct click is the best opportunity to start every stream currently
    // visible. Only the selected stream is audible; the others keep playing muted.
    const visibleNow = viewMode === 'dual'
      ? (isDesktopGrid
          ? [
              channel,
              ...channels
                .filter((item) => item !== channel)
                .slice(desktopPage * 3, desktopPage * 3 + 3),
            ]
          : slotChannels)
      : [channel];

    playersRef.current.forEach((player, playerChannel) => {
      try {
        const visible = visibleNow.includes(playerChannel);
        const selected = playerChannel === channel;
        if (visible) player.play?.();
        player.setMuted(!selected);
        player.setVolume(selected ? 1 : 0);
      } catch {
        // The React state effect will apply the same audio state once ready.
      }
    });
  }

  function rotateOther(direction) {
    if (channels.length <= 2 || slotChannels.length < 2) return;

    const activeSlotIndex = slotChannels.indexOf(activeChannel);
    const replaceIndex = activeSlotIndex === 0 ? 1 : 0;
    const currentOther = slotChannels[replaceIndex];
    const candidates = channels.filter((channel) => channel !== activeChannel);
    const currentIndex = Math.max(0, candidates.indexOf(currentOther));
    const nextIndex = (currentIndex + direction + candidates.length) % candidates.length;
    const nextChannel = candidates[nextIndex];

    // Keep the replacement player mounted and muted. Avoid calling play again
    // here because repeated play calls can replay Twitch's startup sequence.
    try {
      playersRef.current.get(nextChannel)?.setMuted?.(true);
      playersRef.current.get(nextChannel)?.setVolume?.(0);
    } catch {
      // The player may still be initializing.
    }

    setSlotChannels((current) => current.map((channel, index) => index === replaceIndex ? nextChannel : channel));
  }

  function previousOther() {
    rotateOther(-1);
  }

  function nextOther() {
    rotateOther(1);
  }

  function openEditGroup() {
    setEditInputs([...channels, '', '', '', '', '', '', '', ''].slice(0, 8));
    setShowEdit(true);
  }

  function updateGroup() {
    const unique = [...new Set(editInputs.map(cleanChannel).filter(Boolean))].slice(0, 8);
    if (!unique.length) return;

    const nextActive = unique.includes(activeChannel) ? activeChannel : unique[0];
    const currentSecondary = slotChannels.find((channel) => channel !== activeChannel && unique.includes(channel));
    const nextSecondary = currentSecondary || unique.find((channel) => channel !== nextActive);

    setChannels(unique);
    setDesktopPage(0);
    setActiveChannel(nextActive);
    setSlotChannels([nextActive, nextSecondary].filter(Boolean));
    localStorage.setItem(LAST_CHANNELS_KEY, JSON.stringify(unique));


    setShowEdit(false);
  }

  async function installApp() {
    trackEvent('install_app_clicked', {
      current_screen: 'home',
      install_prompt_available: Boolean(installPrompt),
    });

    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }

    setShowInstallHelp(true);
  }


  function exitViewer(exitMethod = 'back_button') {
    if (viewerSessionActiveRef.current) {
      viewerSessionActiveRef.current = false;
      trackEvent('viewer_exited', {
        stream_count_bucket: getStreamCountBucket(channels.length),
        exit_method: exitMethod,
      });
    }
    setScreen('home');
  }

  function cycleFocused(direction) {
    if (channels.length <= 1) return;
    const currentIndex = Math.max(0, channels.indexOf(activeChannel));
    const nextIndex = (currentIndex + direction + channels.length) % channels.length;
    const nextChannel = channels[nextIndex];

    setActiveChannel(nextChannel);
    setAudioEnabled(true);

    try {
      playersRef.current.forEach((player, channel) => {
        const selected = channel === nextChannel;
        if (selected) player.play?.();
        player.setMuted?.(!selected);
        player.setVolume?.(selected ? 1 : 0);
      });
    } catch {
      // State synchronization will apply once the player is ready.
    }
  }

  function focusChannelAudio(channel) {
    setActiveChannel(channel);
    setAudioEnabled(true);

    playersRef.current.forEach((player, playerChannel) => {
      try {
        const selected = playerChannel === channel;
        if (selected) player.play?.();
        player.setMuted?.(!selected);
        player.setVolume?.(selected ? 1 : 0);
      } catch {
        // State synchronization will apply once the player is ready.
      }
    });
  }

  function enterSolo(channel = activeChannel) {
    setActiveChannel(channel);
    setAudioEnabled(true);
    setViewMode('solo');
    try {
      playersRef.current.get(channel)?.play?.();
    } catch {
      // Twitch's native controls remain available.
    }
  }

  function enterChatMode() {
    setViewMode('chat');
  }

  function returnToDual() {
    setViewMode('dual');
    setSlotChannels((current) => {
      const nextSlots = current.includes(activeChannel)
        ? current
        : [activeChannel, channels.find((channel) => channel !== activeChannel)].filter(Boolean);

      nextSlots.forEach((channel) => {
        try {
          if (channel !== activeChannel) {
            playersRef.current.get(channel)?.setMuted?.(true);
            playersRef.current.get(channel)?.setVolume?.(0);
          }
        } catch {
          // Twitch's native controls remain available.
        }
      });

      return nextSlots;
    });
  }

  function saveFavoriteStreamers(nextStreamers) {
    const cleaned = [...new Set(nextStreamers.map(cleanChannel).filter(Boolean))];
    setFavoriteStreamers(cleaned);
    localStorage.setItem(FAVORITE_STREAMERS_KEY, JSON.stringify(cleaned));
  }

  function toggleFavoriteStreamer(channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned) return;
    const next = favoriteStreamers.includes(cleaned)
      ? favoriteStreamers.filter((item) => item !== cleaned)
      : [cleaned, ...favoriteStreamers];
    saveFavoriteStreamers(next);
  }

  function addFavoriteToGroup(channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned) return;
    setInputs((current) => {
      if (current.some((item) => cleanChannel(item) === cleaned)) return current;
      const emptyIndex = current.findIndex((item) => !cleanChannel(item));
      if (emptyIndex === -1) return current;
      return current.map((item, index) => index === emptyIndex ? cleaned : item);
    });
  }

  function removeFavoriteStreamer(channel) {
    saveFavoriteStreamers(favoriteStreamers.filter((item) => item !== channel));
  }

  function removeChannelFromGroup(channelToRemove) {
    const remaining = channels.filter((channel) => channel !== channelToRemove);

    try {
      playersRef.current.get(channelToRemove)?.setMuted?.(true);
      playersRef.current.get(channelToRemove)?.setVolume?.(0);
    } catch {
      // The player may already be unmounting.
    }

    if (!remaining.length) {
      setChannels([]);
      setActiveChannel('');
      setSlotChannels([]);
      setAudioEnabled(false);
      setDesktopPage(0);
      localStorage.setItem(LAST_CHANNELS_KEY, JSON.stringify([]));
      exitViewer('last_stream_removed');
      return;
    }

    const nextActive = channelToRemove === activeChannel ? remaining[0] : activeChannel;
    const retainedSecondary = slotChannels.find(
      (channel) => channel !== channelToRemove && channel !== nextActive && remaining.includes(channel),
    );
    const nextSecondary = retainedSecondary || remaining.find((channel) => channel !== nextActive);

    setChannels(remaining);
    setActiveChannel(nextActive);
    setSlotChannels([nextActive, nextSecondary].filter(Boolean));
    setDesktopPage(0);
    localStorage.setItem(LAST_CHANNELS_KEY, JSON.stringify(remaining));
  }

  async function shareView() {
    const url = new URL(window.location.href);
    url.searchParams.set('channels', channels.join(','));
    const payload = { title: 'SquadView', text: `Watch ${channels.join(', ')} together`, url: url.toString() };
    try {
      if (navigator.share) await navigator.share(payload);
      else await navigator.clipboard.writeText(url.toString());
    } catch {
      // User dismissed the share sheet.
    }
  }

  if (screen === 'loading') {
    return <LoadingAd onComplete={() => setScreen('viewer')} />;
  }

  if (screen === 'viewer') {
    const dualChannels = slotChannels.length ? slotChannels : channels.slice(0, 2);
    // On desktop, the focused stream stays pinned on every page. The remaining
    // three grid slots rotate through the rest of the group.
    const desktopOtherChannels = channels.filter((channel) => channel !== activeChannel);
    const desktopPageSize = 3;
    const desktopPageCount = Math.max(1, Math.ceil(desktopOtherChannels.length / desktopPageSize));
    const desktopPageStart = desktopPage * desktopPageSize;
    const desktopPageOthers = desktopOtherChannels.slice(desktopPageStart, desktopPageStart + desktopPageSize);
    const desktopChannels = [activeChannel, ...desktopPageOthers].filter(Boolean);
    const desktopChatChannels = desktopChannels.slice(0, 3);
    const visibleChannels = viewMode === 'dual'
      ? (isDesktopGrid ? desktopChannels : dualChannels)
      : viewMode === 'chat' && isDesktopGrid
        ? desktopChatChannels
        : [activeChannel];
    const desktopTileCount = viewMode === 'chat' && isDesktopGrid
      ? visibleChannels.length + 1
      : visibleChannels.length;
    const rotatingChannel = dualChannels.find((channel) => channel !== activeChannel) || dualChannels[1] || '';
    const cycleBackward = viewMode === 'dual' ? previousOther : () => cycleFocused(-1);
    const cycleForward = viewMode === 'dual' ? nextOther : () => cycleFocused(1);
    const previousDesktopPage = () => {
      setDesktopPage((current) => (current - 1 + desktopPageCount) % desktopPageCount);
    };
    const nextDesktopPage = () => {
      setDesktopPage((current) => (current + 1) % desktopPageCount);
    };

    return (
      <div className={`viewer-shell mode-${viewMode}`}>
        <header className="viewer-header">
          <button className="icon-button" onClick={() => exitViewer('back_button')} aria-label="Back"><ArrowLeft /></button>
          <div>
            <strong>SquadView</strong>
            <span>{viewMode === 'dual' ? (isDesktopGrid && channels.length > 2 ? 'Desktop grid' : 'Dual view') : viewMode === 'chat' ? 'Stream + chat' : 'Solo focus'}</span>
          </div>
          <div className="header-actions">
            <button className="edit-group-button" onClick={openEditGroup}>Edit group</button>
            <button className="icon-button" onClick={shareView} aria-label="Share"><Share2 /></button>
            <button
              className={`icon-button ${favoriteStreamers.includes(activeChannel) ? 'is-favorite' : ''}`}
              onClick={() => toggleFavoriteStreamer(activeChannel)}
              aria-label={favoriteStreamers.includes(activeChannel) ? `Remove ${activeChannel} from favorite streamers` : `Save ${activeChannel} as a favorite streamer`}
              title={favoriteStreamers.includes(activeChannel) ? 'Remove favorite streamer' : 'Save favorite streamer'}
            >
              {favoriteStreamers.includes(activeChannel) ? <FilledHeart /> : <Heart />}
            </button>
          </div>
        </header>

        <main className="viewer-content">
          <div className="viewer-workspace">
            <section className={`stream-stage mode-${viewMode} desktop-count-${desktopTileCount}`}>
              <div className="stream-stage-players">
                {visibleChannels.map((channel) => (
                  <TwitchPlayer
                    key={channel}
                    channel={channel}
                    visible={visibleChannels.includes(channel)}
                    active={activeChannel === channel}
                    audioEnabled={audioEnabled}
                    onSelect={() => selectChannel(channel)}
                    onFocus={() => focusChannelAudio(channel)}
                    isFavorite={favoriteStreamers.includes(channel)}
                    onToggleFavorite={() => toggleFavoriteStreamer(channel)}
                    onRemove={() => removeChannelFromGroup(channel)}
                    registerPlayer={registerPlayer}
                  />
                ))}

                {viewMode === 'chat' && isDesktopGrid && (
                  <section className="desktop-grid-chat-tile">
                    <ChatPanel channel={activeChannel} />
                  </section>
                )}

                {viewMode === 'chat' && !isDesktopGrid && (
                  <section className="mobile-chat-tile">
                    <ChatPanel channel={activeChannel} />
                  </section>
                )}
              </div>
            </section>

            {!isDesktopGrid && viewMode === 'dual' && channels.length === 2 && dualChannels.length > 1 && (
              <div className="mix-controls" aria-label="Change the secondary stream">
                <button onClick={previousOther} aria-label="Previous secondary stream">←</button>
                <div>
                  <span>Rotate the other stream</span>
                  <strong>{rotatingChannel}</strong>
                </div>
                <button onClick={nextOther} aria-label="Next secondary stream">→</button>
              </div>
            )}

            {!isDesktopGrid && channels.length > 2 && (
              <div className="mobile-stream-pager" aria-label="Move through streams">
                <button
                  onClick={viewMode === 'dual' ? previousOther : () => cycleFocused(-1)}
                  aria-label="Previous stream"
                >
                  ←
                </button>
                <div>
                  <span>{viewMode === 'dual' ? 'Other stream' : viewMode === 'chat' ? 'Stream + chat' : 'Focused stream'}</span>
                  <strong>
                    {viewMode === 'dual'
                      ? `${channels.indexOf(rotatingChannel) + 1} of ${channels.length}`
                      : `${channels.indexOf(activeChannel) + 1} of ${channels.length}`}
                  </strong>
                </div>
                <button
                  onClick={viewMode === 'dual' ? nextOther : () => cycleFocused(1)}
                  aria-label="Next stream"
                >
                  →
                </button>
              </div>
            )}

            {!isDesktopGrid && channels.length === 2 && viewMode !== 'dual' && (
              <div className="focus-carousel" aria-label="Move through selected streams">
                <button onClick={() => cycleFocused(-1)} aria-label="Previous stream">←</button>
                <div>
                  <span>{viewMode === 'chat' ? 'Stream + chat' : 'Focused stream'}</span>
                  <strong>{activeChannel}</strong>
                </div>
                <button onClick={() => cycleFocused(1)} aria-label="Next stream">→</button>
              </div>
            )}
          </div>

          <nav className={`viewer-toolbar ${isDesktopGrid && desktopPageCount > 1 && viewMode !== 'solo' ? 'has-page-controls' : ''}`}>
            <button className={viewMode === 'dual' ? 'is-current' : ''} onClick={returnToDual}>▦ {isDesktopGrid ? 'Grid' : 'Dual'}</button>
            <button className={viewMode === 'chat' ? 'is-current' : ''} onClick={enterChatMode}>☰ Chat</button>

            {isDesktopGrid && desktopPageCount > 1 && viewMode !== 'solo' && (
              <div className="toolbar-page-controls" aria-label="Change visible stream page">
                <button type="button" onClick={previousDesktopPage} aria-label="Previous stream page">←</button>
                <span>Page {desktopPage + 1} of {desktopPageCount}</span>
                <button type="button" onClick={nextDesktopPage} aria-label="Next stream page">→</button>
              </div>
            )}

            <button className={viewMode === 'solo' ? 'is-current' : ''} onClick={() => enterSolo()}>⛶ Solo</button>
            {isDesktopGrid && (
              <button
                onClick={viewMode !== 'solo' ? nextDesktopPage : cycleForward}
                disabled={viewMode !== 'solo' ? desktopPageCount <= 1 : channels.length <= 1}
              >
                Next →
              </button>
            )}
          </nav>
        </main>

        {showEdit && (
          <div className="modal-backdrop" onClick={() => setShowEdit(false)}>
            <section className="modal edit-group-modal" onClick={(event) => event.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowEdit(false)}><X /></button>
              <h2>Edit this group</h2>
              <p>Correct, add, or remove channels without leaving your current view.</p>
              <div className="edit-channel-list">
                {editInputs.map((value, index) => (
                  <label key={index}>
                    <span>{index + 1}</span>
                    <input
                      value={value}
                      onChange={(event) => setEditInputs((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                      placeholder={index === 0 ? 'Twitch username' : 'Add another stream'}
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                    {value && <button type="button" onClick={() => setEditInputs((current) => current.map((item, itemIndex) => itemIndex === index ? '' : item))} aria-label="Clear channel"><X /></button>}
                  </label>
                ))}
              </div>
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => setShowEdit(false)}>Cancel</button>
                <button className="primary-button" onClick={updateGroup} disabled={!editInputs.some((value) => cleanChannel(value))}>Update group</button>
              </div>
            </section>
          </div>
        )}

      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top"><span><Radio /></span>SquadView</a>
        <div className="topbar-actions">
          <button className="install-button" onClick={installApp}>Install app</button>
          <span className="coming-soon">Premium coming soon</span>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="eyebrow"><span /> Built for phones, tablets, and laptops</div>
          <h1>Your streams.<br /><em>One view.</em></h1>
          <p>Add up to eight Twitch channels. SquadView loads only the streams currently on screen: up to four on desktop and two on smaller screens, with fast rotation through the rest of your group.</p>
        </section>

        <section className="builder-card">
          <div className="section-title">
            <div><span>Build your view</span><h2>Add Twitch channels</h2></div>
            <small>{validInputs.length}/8</small>
          </div>

          <div className="channel-list">
            {inputs.map((value, index) => (
              <label key={index}>
                <span>{index + 1}</span>
                <input
                  value={value}
                  onChange={(event) => setInputs((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                  placeholder={index === 0 ? 'Twitch username' : 'Add another stream'}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                {value && <button onClick={() => setInputs((current) => current.map((item, itemIndex) => itemIndex === index ? '' : item))} aria-label="Clear"><X /></button>}
              </label>
            ))}
          </div>

          <div className="auto-layout">
            <div><Sparkles /><span><strong>Auto layout</strong><small>We’ll arrange the screen based on how many streams you add.</small></span></div>
            <span className="status-pill">On</span>
          </div>

          <button className="primary-button start-button" disabled={!validInputs.length} onClick={() => beginWatching()}>
            Start watching <span>→</span>
          </button>
          <p className="ad-note">A short sponsor screen appears while your streams load.</p>
        </section>

        <HomeAdSlot />

        <section className="favorites-section">
          <div className="section-title">
            <div><span>Your shortcuts</span><h2>Favorites</h2></div>
            <Heart />
          </div>

          {favoriteStreamers.length ? (
            <div className="favorite-streamers-list">
              {favoriteStreamers.map((streamer) => {
                const alreadyAdded = validInputs.includes(streamer);
                const groupIsFull = validInputs.length >= 8;
                return (
                  <article key={streamer}>
                    <div className="favorite-streamer-name">
                      <FilledHeart />
                      <span>
                        <strong>{streamer}</strong>
                        <small>
                          {liveFavoriteStreamers.has(streamer) && <i className="live-dot" aria-hidden="true" />}
                          {liveFavoriteStreamers.has(streamer) ? 'Live now' : 'Twitch streamer'}
                        </small>
                      </span>
                    </div>
                    <button
                      className="favorite-add-button"
                      onClick={() => addFavoriteToGroup(streamer)}
                      disabled={alreadyAdded || groupIsFull}
                    >
                      {alreadyAdded ? 'Added' : groupIsFull ? 'Group full' : '+ Add'}
                    </button>
                    <button className="delete-button" onClick={() => removeFavoriteStreamer(streamer)} aria-label={`Remove ${streamer} from favorites`}><Trash2 /></button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-favorites">
              <Heart />
              <strong>No favorite streamers yet</strong>
              <p>While watching, tap the heart beside the active streamer. They will appear here for quick group building.</p>
            </div>
          )}
        </section>

        <section className="how-it-works">
          <span>Simple by design</span>
          <h2>Tap. Listen. Focus.</h2>
          <div className="steps">
            <article><b>01</b><strong>Tap</strong><p>Switch the active audio and chat.</p></article>
            <article><b>02</b><strong>Rotate</strong><p>Swap the other visible stream without losing your active one.</p></article>
            <article><b>03</b><strong>Save</strong><p>Favorite individual streamers and add them to any group in one tap.</p></article>
          </div>
        </section>

        <FooterAdSlot />
      </main>

      <SiteFooter />

      {showInstallHelp && (
        <div className="modal-backdrop" onClick={() => setShowInstallHelp(false)}>
          <section className="modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowInstallHelp(false)}><X /></button>
            <h2>Add SquadView to your home screen</h2>
            <p>On iPhone, open the Share menu in Safari and choose <strong>Add to Home Screen</strong>. On Android or desktop Chrome, open the browser menu and choose <strong>Install app</strong>.</p>
            <button className="primary-button" onClick={() => setShowInstallHelp(false)}>Got it</button>
          </section>
        </div>
      )}
    </div>
  );
}


export default function App() {
  const route = window.location.pathname.replace(/\/+$/, '') || '/';

  if (route === '/privacy') return <PrivacyPage />;
  if (route === '/terms') return <TermsPage />;
  if (route === '/support' || route === '/contact') return <SupportPage />;

  return <SquadViewApp />;
}
