import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TwitchPlayer from './components/TwitchPlayer';
import ChatPanel from './components/ChatPanel';
import LoadingAd from './components/LoadingAd';

function Icon({ symbol, className = '' }) {
  return <span className={`text-icon ${className}`} aria-hidden="true">{symbol}</span>;
}
const ArrowLeft = () => <Icon symbol="←" />;
const Heart = () => <Icon symbol="♡" />;
const Maximize2 = () => <Icon symbol="⛶" />;
const Menu = () => <Icon symbol="☰" />;
const Radio = () => <Icon symbol="◉" />;
const Save = () => <Icon symbol="☆" />;
const Share2 = () => <Icon symbol="↗" />;
const Sparkles = () => <Icon symbol="✦" />;
const Trash2 = () => <Icon symbol="×" />;
const X = () => <Icon symbol="×" />;

const FAVORITES_KEY = 'squadview:favorites:v1';
const LAST_CHANNELS_KEY = 'squadview:last-channels:v1';

function readFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  } catch {
    return [];
  }
}

function cleanChannel(value) {
  return value.trim().replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

export default function App() {
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
  const [favorites, setFavorites] = useState(readFavorites);
  const [favoriteName, setFavoriteName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editInputs, setEditInputs] = useState(['', '', '', '', '', '', '', '']);
  const [activeFavoriteId, setActiveFavoriteId] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [viewMode, setViewMode] = useState('dual');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [slotChannels, setSlotChannels] = useState([]);
  const [desktopPage, setDesktopPage] = useState(0);
  const [isDesktopGrid, setIsDesktopGrid] = useState(() => window.matchMedia?.('(min-width: 1100px)').matches ?? false);
  const playersRef = useRef(new Map());

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


  const validInputs = useMemo(() => inputs.map(cleanChannel).filter(Boolean), [inputs]);

  function beginWatching(selected = validInputs, favoriteId = null) {
    const unique = [...new Set(selected)].slice(0, 8);
    if (!unique.length) return;
    setChannels(unique);
    setActiveChannel(unique[0]);
    setAudioEnabled(false);
    setViewMode('dual');
    setSlotChannels(unique.slice(0, 2));
    setDesktopPage(0);
    setActiveFavoriteId(favoriteId);
    localStorage.setItem(LAST_CHANNELS_KEY, JSON.stringify(unique));
    setScreen('loading');
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

    if (activeFavoriteId) {
      const nextFavorites = favorites.map((favorite) => (
        favorite.id === activeFavoriteId ? { ...favorite, channels: unique } : favorite
      ));
      setFavorites(nextFavorites);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(nextFavorites));
    }

    setShowEdit(false);
  }

  async function installApp() {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }
    setShowInstallHelp(true);
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

  function saveFavorite() {
    const name = favoriteName.trim() || channels.join(' + ');
    const id = crypto.randomUUID();
    const next = [{ id, name, channels }, ...favorites];
    setFavorites(next);
    setActiveFavoriteId(id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    setFavoriteName('');
    setShowSave(false);
  }

  function removeFavorite(id) {
    const next = favorites.filter((favorite) => favorite.id !== id);
    setFavorites(next);
    if (activeFavoriteId === id) setActiveFavoriteId(null);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
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
    const visibleChannels = viewMode === 'dual'
      ? (isDesktopGrid ? desktopChannels : dualChannels)
      : [activeChannel];
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
          <button className="icon-button" onClick={() => setScreen('home')} aria-label="Back"><ArrowLeft /></button>
          <div>
            <strong>SquadView</strong>
            <span>{viewMode === 'dual' ? (isDesktopGrid && channels.length > 2 ? 'Desktop grid' : 'Dual view') : viewMode === 'chat' ? 'Stream + chat' : 'Solo focus'}</span>
          </div>
          <div className="header-actions">
            <button className="edit-group-button" onClick={openEditGroup}>Edit group</button>
            <button className="icon-button" onClick={shareView} aria-label="Share"><Share2 /></button>
            <button className="icon-button" onClick={() => setShowSave(true)} aria-label="Save favorite"><Heart /></button>
          </div>
        </header>

        <main className="viewer-content">
          <div className="viewer-workspace">
            <section className={`stream-stage mode-${viewMode} desktop-count-${visibleChannels.length}`}>
              <div className="stream-stage-players">
                {visibleChannels.map((channel) => (
                  <TwitchPlayer
                    key={channel}
                    channel={channel}
                    visible={visibleChannels.includes(channel)}
                    active={activeChannel === channel}
                    audioEnabled={audioEnabled}
                    onSelect={() => selectChannel(channel)}
                    onFocus={() => enterSolo(channel)}
                    registerPlayer={registerPlayer}
                  />
                ))}

                {viewMode === 'dual' && isDesktopGrid && visibleChannels.length === 3 && (
                  <section className="desktop-grid-chat-tile">
                    <ChatPanel channel={activeChannel} />
                  </section>
                )}
              </div>

              {viewMode === 'chat' && (
                <section className="focused-chat-panel">
                  <ChatPanel channel={activeChannel} />
                </section>
              )}
            </section>

            {viewMode === 'dual' && isDesktopGrid && desktopPageCount > 1 && (
              <div className="desktop-page-controls" aria-label="Change visible stream page">
                <button onClick={previousDesktopPage} aria-label="Previous stream page">←</button>
                <div>
                  <span>Focused stream pinned · rotating up to 3 others</span>
                  <strong>Page {desktopPage + 1} of {desktopPageCount}</strong>
                </div>
                <button onClick={nextDesktopPage} aria-label="Next stream page">→</button>
              </div>
            )}

            {viewMode === 'dual' && !isDesktopGrid && channels.length > 2 && dualChannels.length > 1 && (
              <div className="mix-controls" aria-label="Change the secondary stream">
                <button onClick={previousOther} aria-label="Previous secondary stream">←</button>
                <div>
                  <span>Rotate the other stream</span>
                  <strong>{rotatingChannel}</strong>
                </div>
                <button onClick={nextOther} aria-label="Next secondary stream">→</button>
              </div>
            )}

            {viewMode === 'dual' && !(isDesktopGrid && visibleChannels.length === 3) && (
              <section className="chat-preview">
                <ChatPanel channel={activeChannel} compact />
                <button className="expand-chat-button" onClick={enterChatMode}>Open full chat</button>
              </section>
            )}

            {viewMode !== 'dual' && channels.length > 1 && (
              <div className="focus-carousel" aria-label="Move through selected streams">
                <button onClick={cycleBackward} aria-label="Previous stream">←</button>
                <div>
                  <span>{viewMode === 'chat' ? 'Stream + chat' : 'Focused stream'}</span>
                  <strong>{activeChannel}</strong>
                </div>
                <button onClick={cycleForward} aria-label="Next stream">→</button>
              </div>
            )}
          </div>

          <nav className="viewer-toolbar">
            <button className={viewMode === 'dual' ? 'is-current' : ''} onClick={returnToDual}>▦ {isDesktopGrid ? 'Grid' : 'Dual'}</button>
            <button className={viewMode === 'chat' ? 'is-current' : ''} onClick={enterChatMode}>☰ Chat</button>
            <button className={viewMode === 'solo' ? 'is-current' : ''} onClick={() => enterSolo()}>⛶ Solo</button>
            <button onClick={cycleForward} disabled={channels.length <= (isDesktopGrid ? 4 : 1)}>Next →</button>
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
              {activeFavoriteId && <small className="favorite-update-note">This also updates the saved favorite on this device.</small>}
            </section>
          </div>
        )}

        {showSave && (
          <div className="modal-backdrop" onClick={() => setShowSave(false)}>
            <section className="modal" onClick={(event) => event.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowSave(false)}><X /></button>
              <Sparkles />
              <h2>Save this favorite</h2>
              <p>It will stay on this device. Accounts and cloud sync are coming later.</p>
              <input value={favoriteName} onChange={(event) => setFavoriteName(event.target.value)} placeholder="Friday night squad" />
              <button className="primary-button" onClick={saveFavorite}>Save favorite</button>
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

        <section className="favorites-section">
          <div className="section-title">
            <div><span>Your shortcuts</span><h2>Favorites</h2></div>
            <Heart />
          </div>

          {favorites.length ? (
            <div className="favorites-list">
              {favorites.map((favorite) => (
                <article key={favorite.id}>
                  <button className="favorite-main" onClick={() => beginWatching(favorite.channels, favorite.id)}>
                    <strong>{favorite.name}</strong>
                    <span>{favorite.channels.join(' · ')}</span>
                  </button>
                  <button className="delete-button" onClick={() => removeFavorite(favorite.id)} aria-label={`Delete ${favorite.name}`}><Trash2 /></button>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-favorites">
              <Heart />
              <strong>No favorites yet</strong>
              <p>Start a view, then save it for one-tap access next time.</p>
            </div>
          )}
        </section>

        <section className="how-it-works">
          <span>Simple by design</span>
          <h2>Tap. Listen. Focus.</h2>
          <div className="steps">
            <article><b>01</b><strong>Tap</strong><p>Switch the active audio and chat.</p></article>
            <article><b>02</b><strong>Rotate</strong><p>Swap the other visible stream without losing your active one.</p></article>
            <article><b>03</b><strong>Save</strong><p>Keep favorite groups on this device.</p></article>
          </div>
        </section>
      </main>

      <footer><strong>SquadView</strong><span>Watch together, wherever.</span></footer>

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
