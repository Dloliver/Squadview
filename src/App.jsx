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
import AboutPage from './pages/AboutPage';
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
const VIEWER_SESSION_KEY = 'squadview:viewer-session:v1';
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
  return String(value || '').trim().replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

function readViewerSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(VIEWER_SESSION_KEY) || 'null');
    const restoredChannels = Array.isArray(saved?.channels)
      ? [...new Set(saved.channels.map(cleanChannel).filter(Boolean))].slice(0, 8)
      : [];

    if (!restoredChannels.length) return null;

    const requestedActive = cleanChannel(saved?.activeChannel);
    const restoredActive = restoredChannels.includes(requestedActive)
      ? requestedActive
      : restoredChannels[0];
    const restoredMode = ['dual', 'chat', 'solo'].includes(saved?.viewMode)
      ? saved.viewMode
      : 'dual';
    const restoredSlots = Array.isArray(saved?.slotChannels)
      ? [...new Set(saved.slotChannels.map(cleanChannel).filter((channel) => restoredChannels.includes(channel)))].slice(0, 2)
      : [];
    const fallbackSecondary = restoredChannels.find((channel) => channel !== restoredActive);
    const normalizedSlots = restoredSlots.includes(restoredActive)
      ? restoredSlots
      : [restoredActive, restoredSlots[0] || fallbackSecondary].filter(Boolean);

    return {
      channels: restoredChannels,
      activeChannel: restoredActive,
      viewMode: restoredMode,
      slotChannels: normalizedSlots,
      desktopPage: Number.isInteger(saved?.desktopPage) && saved.desktopPage >= 0 ? saved.desktopPage : 0,
    };
  } catch {
    return null;
  }
}

function SquadViewApp() {
  const [restoredViewer] = useState(readViewerSession);
  const [screen, setScreen] = useState(() => restoredViewer ? 'viewer' : 'home');
  const [inputs, setInputs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_CHANNELS_KEY) || '[]');
      return [...saved, '', '', '', '', '', '', '', ''].slice(0, 8);
    } catch {
      return ['', '', '', ''];
    }
  });
  const [channels, setChannels] = useState(() => restoredViewer?.channels || []);
  const [activeChannel, setActiveChannel] = useState(() => restoredViewer?.activeChannel || '');
  const [favoriteStreamers, setFavoriteStreamers] = useState(readFavoriteStreamers);
  const [liveFavoriteStreamers, setLiveFavoriteStreamers] = useState(() => new Set());
  const [landingTab, setLandingTab] = useState('home');
  const [builderMode, setBuilderMode] = useState('manual');
  const [showEdit, setShowEdit] = useState(false);
  const [editInputs, setEditInputs] = useState(['', '', '', '', '', '', '', '']);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [viewMode, setViewMode] = useState(() => restoredViewer?.viewMode || 'dual');
  // Always restore refreshed viewers muted. Browsers generally block autoplaying
  // audio after a hard refresh until the user interacts with the page again.
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [slotChannels, setSlotChannels] = useState(() => restoredViewer?.slotChannels || []);
  const [desktopPage, setDesktopPage] = useState(() => restoredViewer?.desktopPage || 0);
  const [isDesktopGrid, setIsDesktopGrid] = useState(() => window.matchMedia?.('(min-width: 1100px)').matches ?? false);
  const playersRef = useRef(new Map());
  const viewerSessionActiveRef = useRef(Boolean(restoredViewer));

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

  // Preserve the active viewer layout across a browser refresh. Session storage
  // intentionally expires with the tab, so reopening SquadView later still
  // starts on the normal home screen.
  useEffect(() => {
    if (screen !== 'viewer' || !channels.length) return;

    try {
      sessionStorage.setItem(VIEWER_SESSION_KEY, JSON.stringify({
        channels,
        activeChannel: channels.includes(activeChannel) ? activeChannel : channels[0],
        viewMode,
        slotChannels,
        desktopPage,
      }));
    } catch {
      // Storage can be unavailable in private or restricted browsing contexts.
    }
  }, [screen, channels, activeChannel, viewMode, slotChannels, desktopPage]);

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
  const sortedFavoriteStreamers = useMemo(
    () => [...favoriteStreamers].sort((first, second) => {
      const liveDifference =
        Number(liveFavoriteStreamers.has(second)) - Number(liveFavoriteStreamers.has(first));
      return liveDifference || first.localeCompare(second);
    }),
    [favoriteStreamers, liveFavoriteStreamers],
  );
  const liveFavoriteList = useMemo(
    () => sortedFavoriteStreamers.filter((streamer) => liveFavoriteStreamers.has(streamer)),
    [sortedFavoriteStreamers, liveFavoriteStreamers],
  );

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
    try {
      sessionStorage.removeItem(VIEWER_SESSION_KEY);
    } catch {
      // Leaving the viewer should still work when storage is unavailable.
    }

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

  function removeFromBuildList(channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned) return;
    setInputs((current) =>
      current.map((item) => cleanChannel(item) === cleaned ? '' : item),
    );
  }

  function openLandingTab(tab) {
    setLandingTab(tab);
    window.requestAnimationFrame(() => {
      document.getElementById('top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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
    // Chat mode is intentionally focused on a single stream on every screen
    // size. Desktop now mirrors mobile: selected stream + that stream's chat.
    const visibleChannels = viewMode === 'dual'
      ? (isDesktopGrid ? desktopChannels : dualChannels)
      : [activeChannel];
    const desktopTileCount = viewMode === 'chat' && isDesktopGrid
      ? 2
      : visibleChannels.length;
    const rotatingChannel = dualChannels.find((channel) => channel !== activeChannel) || dualChannels[1] || '';
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

          <nav className={`viewer-toolbar ${isDesktopGrid && desktopPageCount > 1 && viewMode === 'dual' ? 'has-page-controls' : ''}`}>
            <button className={viewMode === 'dual' ? 'is-current' : ''} onClick={returnToDual}>▦ {isDesktopGrid ? 'Grid' : 'Dual'}</button>
            <button className={viewMode === 'chat' ? 'is-current' : ''} onClick={enterChatMode}>☰ Chat</button>

            {isDesktopGrid && desktopPageCount > 1 && viewMode === 'dual' && (
              <div className="toolbar-page-controls" aria-label="Change visible stream page">
                <button type="button" onClick={previousDesktopPage} aria-label="Previous stream page">←</button>
                <span>Page {desktopPage + 1} of {desktopPageCount}</span>
                <button type="button" onClick={nextDesktopPage} aria-label="Next stream page">→</button>
              </div>
            )}

            <button className={viewMode === 'solo' ? 'is-current' : ''} onClick={() => enterSolo()}>⛶ Solo</button>
            {isDesktopGrid && (
              <button
                onClick={viewMode === 'dual' ? nextDesktopPage : cycleForward}
                disabled={viewMode === 'dual' ? desktopPageCount <= 1 : channels.length <= 1}
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
        <a className="brand" href="#top" onClick={() => setLandingTab('home')}>
          <span><Radio /></span>SquadView
        </a>

        <nav className="topbar-nav" aria-label="SquadView pages">
          <button
            type="button"
            className={landingTab === 'home' ? 'is-current' : ''}
            onClick={() => openLandingTab('home')}
          >
            Home
          </button>
          <button
            type="button"
            className={landingTab === 'favorites' ? 'is-current' : ''}
            onClick={() => openLandingTab('favorites')}
          >
            Favorites
            {liveFavoriteList.length > 0 && (
              <span className="nav-live-count">{liveFavoriteList.length} live</span>
            )}
          </button>
        </nav>

        <div className="topbar-actions">
          <button className="install-button" onClick={installApp}>Install app</button>
          <span className="coming-soon">Premium coming soon</span>
        </div>
      </header>

      <main id="top">
        {landingTab === 'home' ? (
          <>
            <section className="hero">
              <div className="eyebrow"><span /> Built for phones, tablets, and laptops</div>
              <h1>Your streams.<br /><em>One view.</em></h1>
              <p>Add up to eight Twitch channels. Type a channel directly or build your view from favorites, then SquadView only loads the streams currently on screen.</p>
            </section>

            <section className="builder-card">
              <div className="section-title">
                <div><span>Build your view</span><h2>Choose your streams</h2></div>
                <small>{validInputs.length}/8</small>
              </div>

              <div className="builder-source-toggle" role="radiogroup" aria-label="Choose how to add streams">
                <label className={builderMode === 'manual' ? 'is-current' : ''}>
                  <input
                    type="radio"
                    name="builder-source"
                    value="manual"
                    checked={builderMode === 'manual'}
                    onChange={() => setBuilderMode('manual')}
                  />
                  <span>Enter streamers</span>
                </label>
                <label className={builderMode === 'favorites' ? 'is-current' : ''}>
                  <input
                    type="radio"
                    name="builder-source"
                    value="favorites"
                    checked={builderMode === 'favorites'}
                    onChange={() => setBuilderMode('favorites')}
                  />
                  <span>Favorites</span>
                </label>
              </div>

              {builderMode === 'manual' ? (
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
                      {value && (
                        <button
                          type="button"
                          onClick={() => setInputs((current) => current.map((item, itemIndex) => itemIndex === index ? '' : item))}
                          aria-label="Clear"
                        >
                          <X />
                        </button>
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="builder-favorites-panel">
                  <div className="builder-favorites-heading">
                    <div>
                      <strong>Favorite streamers</strong>
                      <small>
                        {liveFavoriteList.length
                          ? `${liveFavoriteList.length} live now. Live streamers are shown first.`
                          : 'Your saved streamers are ready when you are.'}
                      </small>
                    </div>
                    <button type="button" onClick={() => openLandingTab('favorites')}>
                      Manage favorites →
                    </button>
                  </div>

                  {sortedFavoriteStreamers.length ? (
                    <div className="builder-favorite-list">
                      {sortedFavoriteStreamers.map((streamer) => {
                        const alreadyAdded = validInputs.includes(streamer);
                        const groupIsFull = validInputs.length >= 8;
                        const isLive = liveFavoriteStreamers.has(streamer);

                        return (
                          <article key={streamer} className={isLive ? 'is-live' : ''}>
                            <div className="favorite-streamer-name">
                              <FilledHeart />
                              <span>
                                <strong>{streamer}</strong>
                                <small>
                                  {isLive && <i className="live-dot" aria-hidden="true" />}
                                  {isLive ? 'Live now' : 'Offline'}
                                </small>
                              </span>
                            </div>
                            <button
                              type="button"
                              className="favorite-add-button"
                              onClick={() => addFavoriteToGroup(streamer)}
                              disabled={alreadyAdded || groupIsFull}
                            >
                              {alreadyAdded ? 'Added ✓' : groupIsFull ? 'View full' : '+ Add'}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-favorites compact">
                      <Heart />
                      <strong>No favorite streamers yet</strong>
                      <p>Favorite someone while watching and they will appear here.</p>
                    </div>
                  )}
                </div>
              )}

              {validInputs.length > 0 && (
                <div className="build-selection-strip">
                  <div className="build-selection-heading">
                    <span>Your view</span>
                    <strong>{validInputs.length} of 8 selected</strong>
                  </div>
                  <div className="build-selection-chips">
                    {validInputs.map((streamer) => (
                      <button
                        type="button"
                        key={streamer}
                        onClick={() => removeFromBuildList(streamer)}
                        aria-label={`Remove ${streamer} from view`}
                      >
                        {streamer} <span aria-hidden="true">×</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button className="primary-button start-button" disabled={!validInputs.length} onClick={() => beginWatching()}>
                {validInputs.length ? `Start watching ${validInputs.length}` : 'Start watching'} <span>→</span>
              </button>
              <p className="ad-note">A short sponsor screen appears while your streams load.</p>
            </section>

            <HomeAdSlot />

            {favoriteStreamers.length > 0 && (
              <section className="live-favorites-section">
                <div className="section-title">
                  <div>
                    <span>Your shortcuts</span>
                    <h2>
                      {liveFavoriteList.length
                        ? `${liveFavoriteList.length} favorite${liveFavoriteList.length === 1 ? '' : 's'} live now`
                        : 'Favorite streamers'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="favorites-link-button"
                    onClick={() => openLandingTab('favorites')}
                  >
                    View favorites →
                  </button>
                </div>

                {liveFavoriteList.length ? (
                  <div className="live-favorites-preview">
                    {liveFavoriteList.slice(0, 3).map((streamer) => {
                      const alreadyAdded = validInputs.includes(streamer);
                      const groupIsFull = validInputs.length >= 8;
                      return (
                        <article key={streamer}>
                          <div>
                            <strong>{streamer}</strong>
                            <small><i className="live-dot" aria-hidden="true" /> Live now</small>
                          </div>
                          <button
                            type="button"
                            onClick={() => addFavoriteToGroup(streamer)}
                            disabled={alreadyAdded || groupIsFull}
                          >
                            {alreadyAdded ? 'Added ✓' : groupIsFull ? 'View full' : '+ Add to view'}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="live-favorites-empty">
                    <Heart />
                    <div>
                      <strong>No favorites are live right now</strong>
                      <small>You can still build a view from your saved streamers.</small>
                    </div>
                    <button type="button" onClick={() => openLandingTab('favorites')}>Open favorites</button>
                  </div>
                )}
              </section>
            )}

            <section className="how-it-works">
              <span>Simple by design</span>
              <h2>Tap. Listen. Focus.</h2>
              <div className="steps">
                <article><b>01</b><strong>Tap</strong><p>Switch the active audio and chat.</p></article>
                <article><b>02</b><strong>Rotate</strong><p>Swap the other visible stream without losing your active one.</p></article>
                <article><b>03</b><strong>Save</strong><p>Favorite individual streamers and build future views in one tap.</p></article>
              </div>
            </section>

            <section className="about-squadview" aria-labelledby="about-squadview-heading">
              <span>Built for multi stream viewing</span>
              <h2 id="about-squadview-heading">Follow more of the action without living in browser tabs.</h2>
              <p>SquadView is an independent viewing interface for Twitch streams. Add the creators you want to follow, keep multiple perspectives visible, and choose which stream you want to hear without rebuilding your setup every time the action moves.</p>
              <p>The experience is designed for tournaments, creator collaborations, friend groups, watch parties, and any moment where one Twitch stream does not tell the whole story. SquadView provides the layout, audio focus, favorites, and viewing controls while Twitch continues to provide the video and chat.</p>
              <div className="about-squadview-links">
                <a href="/about">Learn more about SquadView →</a>
                <a href="/support">Help and FAQ →</a>
              </div>
            </section>

            <FooterAdSlot />
          </>
        ) : (
          <section className="favorites-page">
            <div className="favorites-page-heading">
              <div>
                <span>Your shortcuts</span>
                <h1>Favorites</h1>
                <p>See who is live, add streamers directly to your current view, and keep your saved list organized.</p>
              </div>
              <div className="favorites-live-summary">
                <strong>{liveFavoriteList.length}</strong>
                <span>live now</span>
              </div>
            </div>

            {sortedFavoriteStreamers.length ? (
              <div className="favorites-page-list">
                {sortedFavoriteStreamers.map((streamer) => {
                  const alreadyAdded = validInputs.includes(streamer);
                  const groupIsFull = validInputs.length >= 8;
                  const isLive = liveFavoriteStreamers.has(streamer);

                  return (
                    <article key={streamer} className={isLive ? 'is-live' : ''}>
                      <div className="favorite-streamer-name">
                        <FilledHeart />
                        <span>
                          <strong>{streamer}</strong>
                          <small>
                            {isLive && <i className="live-dot" aria-hidden="true" />}
                            {isLive ? 'Live now' : 'Offline'}
                          </small>
                        </span>
                      </div>

                      <button
                        type="button"
                        className="favorite-add-button"
                        onClick={() => addFavoriteToGroup(streamer)}
                        disabled={alreadyAdded || groupIsFull}
                      >
                        {alreadyAdded ? 'Added ✓' : groupIsFull ? 'View full' : '+ Add'}
                      </button>

                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => removeFavoriteStreamer(streamer)}
                        aria-label={`Remove ${streamer} from favorites`}
                      >
                        <Trash2 />
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-favorites favorites-page-empty">
                <Heart />
                <strong>No favorite streamers yet</strong>
                <p>While watching, tap the heart beside a streamer. They will appear here for quick group building.</p>
              </div>
            )}

            <div className="favorites-build-dock">
              <div>
                <span>Current view</span>
                <strong>
                  {validInputs.length
                    ? `${validInputs.length} streamer${validInputs.length === 1 ? '' : 's'} selected`
                    : 'No streamers selected yet'}
                </strong>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setBuilderMode('manual');
                  openLandingTab('home');
                }}
              >
                View list
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!validInputs.length}
                onClick={() => beginWatching()}
              >
                {validInputs.length ? `Start watching ${validInputs.length} →` : 'Start watching →'}
              </button>
            </div>
          </section>
        )}
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

  if (route === '/about') return <AboutPage />;
  if (route === '/privacy') return <PrivacyPage />;
  if (route === '/terms') return <TermsPage />;
  if (route === '/support' || route === '/contact') return <SupportPage />;

  return <SquadViewApp />;
}
