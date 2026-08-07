import { useEffect, useRef, useState } from 'react';

let twitchScriptPromise;

function loadTwitchScript() {
  if (window.Twitch?.Player) return Promise.resolve(window.Twitch);
  if (twitchScriptPromise) return twitchScriptPromise;

  twitchScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-squadview-twitch]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Twitch), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://player.twitch.tv/js/embed/v1.js';
    script.async = true;
    script.dataset.squadviewTwitch = 'true';
    script.onload = () => resolve(window.Twitch);
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return twitchScriptPromise;
}

function applyPlayerState(player, { active, audioEnabled, visible }) {
  if (!player) return;
  try {
    const audible = visible && active && audioEnabled;
    player.setMuted(!audible);
    player.setVolume(audible ? 1 : 0);
    // Keep hidden players mounted and muted so changing modes or carousel slots
    // does not restart the Twitch player or replay its startup animation.
  } catch {
    // Twitch can still be initializing when React state changes.
  }
}

export default function TwitchPlayer({
  channel,
  visible,
  active,
  audioEnabled,
  onSelect,
  onFocus,
  isFavorite = false,
  onToggleFavorite,
  onRemove,
  registerPlayer,
}) {
  const mountRef = useRef(null);
  const playerRef = useRef(null);
  const stateRef = useRef({ active, audioEnabled, visible });
  const [status, setStatus] = useState('Loading');

  useEffect(() => {
    stateRef.current = { active, audioEnabled, visible };
    applyPlayerState(playerRef.current, stateRef.current);
  }, [active, audioEnabled, visible]);

  useEffect(() => {
    let cancelled = false;

    loadTwitchScript()
      .then((Twitch) => {
        if (cancelled || !mountRef.current) return;
        mountRef.current.innerHTML = '';

        const player = new Twitch.Player(mountRef.current, {
          channel,
          parent: [window.location.hostname],
          width: 400,
          height: 300,
          autoplay: true,
          muted: true,
          controls: true,
        });

        playerRef.current = player;
        registerPlayer(channel, player);

        player.addEventListener(Twitch.Player.READY, () => {
          setStatus('Ready');
          applyPlayerState(player, stateRef.current);
        });
        player.addEventListener(Twitch.Player.PLAY, () => setStatus('Playing'));
        player.addEventListener(Twitch.Player.PLAYING, () => setStatus('Playing'));
        player.addEventListener(Twitch.Player.PAUSE, () => setStatus('Paused'));
        player.addEventListener(Twitch.Player.OFFLINE, () => setStatus('Offline'));
        player.addEventListener(Twitch.Player.PLAYBACK_BLOCKED, () => setStatus('Tap Twitch play'));
      })
      .catch(() => setStatus('Player unavailable'));

    return () => {
      cancelled = true;
      registerPlayer(channel, null);
      try {
        playerRef.current?.setMuted?.(true);
      } catch {
        // Twitch may already have disposed the iframe.
      }
    };
  }, [channel, registerPlayer]);

  const listening = visible && active && audioEnabled;

  function handleListen() {
    onSelect();
    try {
      playerRef.current?.play?.();
    } catch {
      // The native Twitch play button remains available.
    }
  }

  return (
    <article className={`stream-card ${visible ? 'is-visible' : 'is-hidden'} ${active ? 'is-active' : ''}`} aria-label={`${channel} Twitch stream`}>
      <header className="stream-card-header">
        <span className="live-dot" />
        <strong>{channel}</strong>
        <small>{status}</small>
        <button
          type="button"
          className="remove-stream-chip"
          onClick={onRemove}
          aria-label={`Remove ${channel} from this group`}
          title="Remove from this group"
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="stream-card-actions">
          <button type="button" className={`listen-chip ${listening ? 'is-listening' : ''}`} onClick={handleListen}>
            {listening ? 'Listening' : 'Play & listen'}
          </button>
          <button type="button" className="focus-chip" onClick={onFocus}>Focus</button>
          <button
            type="button"
            className={`favorite-chip ${isFavorite ? 'is-favorite' : ''}`}
            onClick={onToggleFavorite}
            aria-label={isFavorite ? `Remove ${channel} from favorites` : `Add ${channel} to favorites`}
            title={isFavorite ? 'Remove favorite streamer' : 'Add favorite streamer'}
          >
            <span aria-hidden="true">{isFavorite ? '♥' : '♡'}</span>
          </button>
        </div>
      </header>
      <div className="player-viewport">
        <div className="player-mount" ref={mountRef} />
      </div>
    </article>
  );
}
