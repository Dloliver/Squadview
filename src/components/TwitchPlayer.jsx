import { useEffect, useRef, useState } from 'react';

let twitchScriptPromise;

const debugPlayers = new Map();

const LIVE_EDGE_MAX_LATENCY_SECONDS = 20;
const LIVE_EDGE_CHECK_DELAY_MS = 4000;
const LIVE_EDGE_SEEK_CHECK_DELAY_MS = 1200;
const LIVE_EDGE_RESYNC_COOLDOWN_MS = 15000;
const POST_RESYNC_PLAY_DELAY_MS = 900;

function loadTwitchScript() {
  if (window.Twitch?.Player) {
    return Promise.resolve(window.Twitch);
  }

  if (twitchScriptPromise) {
    return twitchScriptPromise;
  }

  twitchScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-squadview-twitch]',
    );

    if (existing) {
      existing.addEventListener(
        'load',
        () => resolve(window.Twitch),
        { once: true },
      );

      existing.addEventListener(
        'error',
        reject,
        { once: true },
      );

      return;
    }

    const script = document.createElement('script');

    script.src =
      'https://player.twitch.tv/js/embed/v1.js';

    script.async = true;
    script.dataset.squadviewTwitch = 'true';

    script.onload = () => resolve(window.Twitch);
    script.onerror = reject;

    document.head.appendChild(script);
  });

  return twitchScriptPromise;
}

function safeRead(reader, fallback = null) {
  try {
    const value = reader();

    return value === undefined
      ? fallback
      : value;
  } catch {
    return fallback;
  }
}

function readPlaybackStats(player) {
  return (
    safeRead(
      () => player?.getPlaybackStats?.(),
      {},
    ) || {}
  );
}

function readLatency(player) {
  const stats = readPlaybackStats(player);
  const latency = Number(
    stats.hlsLatencyBroadcaster,
  );

  return Number.isFinite(latency)
    ? latency
    : null;
}

function normalizeQualityValue(quality) {
  if (typeof quality === 'string') {
    return quality.trim();
  }

  if (!quality || typeof quality !== 'object') {
    return '';
  }

  /*
   * Twitch documentation currently describes getQualities()
   * as String[], but some current embed builds return objects.
   * Prefer known quality identifiers while remaining defensive
   * against future object shapes.
   */
  const directCandidates = [
    quality.group,
    quality.name,
    quality.quality,
    quality.value,
    quality.id,
  ];

  for (const candidate of directCandidates) {
    if (
      typeof candidate === 'string' &&
      candidate.trim()
    ) {
      return candidate.trim();
    }
  }

  const objectStrings = Object.values(quality)
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);

  const qualityLike = objectStrings.find(
    (value) =>
      /^(auto|chunked|source|\d{3,4}p(?:\d{2,3})?)$/i.test(
        value,
      ),
  );

  return qualityLike || '';
}

function getQualities(player) {
  const qualities = safeRead(
    () => player?.getQualities?.(),
    [],
  );

  if (!Array.isArray(qualities)) {
    return [];
  }

  return [
    ...new Set(
      qualities
        .map(normalizeQualityValue)
        .filter(Boolean),
    ),
  ];
}

function qualityInfo(value) {
  const match = String(value).match(
    /(\d{3,4})p(?:([0-9]{2,3}))?/i,
  );

  return {
    value,
    height: match ? Number(match[1]) : 0,
    fps: match?.[2]
      ? Number(match[2])
      : 30,
  };
}

function qualityAtHeight(qualities, height) {
  return (
    qualities
      .map(qualityInfo)
      .filter(
        (quality) =>
          quality.height === height,
      )
      .sort(
        (first, second) =>
          first.fps - second.fps,
      )[0]?.value || ''
  );
}

function chooseFocusedQuality(qualities) {
  const auto = qualities.find(
    (quality) =>
      quality.toLowerCase() === 'auto',
  );

  if (auto) {
    return auto;
  }

  const source = qualities.find(
    (quality) =>
      quality.toLowerCase() === 'chunked',
  );

  if (source) {
    return source;
  }

  return (
    qualities
      .map(qualityInfo)
      .filter(
        (quality) =>
          quality.height > 0,
      )
      .sort(
        (first, second) =>
          second.height - first.height ||
          first.fps - second.fps,
      )[0]?.value || ''
  );
}

function chooseGridQuality(
  qualities,
  visibleCount,
) {
  /*
   * Two visible players can afford a little more
   * resolution. Three or four player grids favor 480p
   * to reduce decoder, GPU, CPU, and bandwidth load.
   */
  const preferredHeights =
    visibleCount >= 3
      ? [480, 720, 360, 160]
      : [720, 480, 360, 160];

  for (const height of preferredHeights) {
    const match = qualityAtHeight(
      qualities,
      height,
    );

    if (match) {
      return match;
    }
  }

  const capped = qualities
    .map(qualityInfo)
    .filter(
      (quality) =>
        quality.height > 0 &&
        quality.height <= 720,
    )
    .sort(
      (first, second) =>
        second.height - first.height ||
        first.fps - second.fps,
    )[0]?.value;

  if (capped) {
    return capped;
  }

  const auto = qualities.find(
    (quality) =>
      quality.toLowerCase() === 'auto',
  );

  if (auto) {
    return auto;
  }

  return (
    qualities.find(
      (quality) =>
        quality.toLowerCase() === 'chunked',
    ) ||
    qualities[0] ||
    ''
  );
}

function applyQualityPolicy(
  player,
  active,
  visibleCount,
) {
  const qualities = getQualities(player);

  if (!qualities.length) {
    return (
      player?.__squadViewQualityTarget ||
      ''
    );
  }

  const target = active
    ? chooseFocusedQuality(qualities)
    : chooseGridQuality(
        qualities,
        visibleCount,
      );

  if (!target) {
    return (
      player.__squadViewQualityTarget ||
      ''
    );
  }

  if (
    target ===
    player.__squadViewQualityTarget
  ) {
    return target;
  }

  try {
    player.setQuality?.(target);

    player.__squadViewQualityTarget =
      target;
  } catch {
    // Twitch may still be populating transcodes.
  }

  return (
    player.__squadViewQualityTarget ||
    target
  );
}

function clearPlayerTimer(
  player,
  propertyName,
) {
  const timer = player?.[propertyName];

  if (timer) {
    window.clearTimeout(timer);
    player[propertyName] = null;
  }
}

function clearLiveEdgeTimers(player) {
  clearPlayerTimer(
    player,
    '__squadViewLiveEdgeTimer',
  );

  clearPlayerTimer(
    player,
    '__squadViewPostResyncTimer',
  );
}

function forceLiveResync(
  player,
  stateRef,
  latency,
) {
  const state = stateRef?.current;

  if (
    !player ||
    !state?.visible ||
    !state.channel
  ) {
    return;
  }

  const now = Date.now();

  const previousResync =
    player.__squadViewLastForcedResyncAt ||
    0;

  if (
    now - previousResync <
    LIVE_EDGE_RESYNC_COOLDOWN_MS
  ) {
    return;
  }

  player.__squadViewLastForcedResyncAt =
    now;

  player.__squadViewForcedResyncCount =
    (player.__squadViewForcedResyncCount ||
      0) + 1;

  player.__squadViewLastLatency =
    latency;

  player.__squadViewLiveEdgeStatus =
    'forcing_live_resync';

  player.__squadViewQualityTarget = '';

  try {
    /*
     * Keep the recovery muted. Audio is restored only
     * after React confirms this stream still owns focus.
     */
    player.setMuted?.(true);
    player.setVolume?.(0);

    /*
     * setChannel on a live channel reloads that live
     * channel rather than seeking to an old timestamp.
     */
    player.setChannel?.(state.channel);
  } catch {
    player.__squadViewLiveEdgeStatus =
      'resync_failed';

    return;
  }

  clearPlayerTimer(
    player,
    '__squadViewPostResyncTimer',
  );

  player.__squadViewPostResyncTimer =
    window.setTimeout(() => {
      const latestState =
        stateRef.current;

      if (!latestState?.visible) {
        return;
      }

      try {
        player.setMuted?.(true);
        player.setVolume?.(0);
        player.play?.();
      } catch {
        // Native Twitch play remains available.
      }

      applyQualityPolicy(
        player,
        latestState.active,
        latestState.visibleCount || 1,
      );

      player.__squadViewLiveEdgeStatus =
        'checking_after_resync';

      scheduleLiveEdgeCheck(
        player,
        stateRef,
        LIVE_EDGE_CHECK_DELAY_MS,
      );
    }, POST_RESYNC_PLAY_DELAY_MS);
}

function scheduleLiveEdgeCheck(
  player,
  stateRef,
  delay = LIVE_EDGE_CHECK_DELAY_MS,
) {
  if (!player || !stateRef) {
    return;
  }

  clearPlayerTimer(
    player,
    '__squadViewLiveEdgeTimer',
  );

  player.__squadViewLiveEdgeTimer =
    window.setTimeout(() => {
      const state = stateRef.current;

      if (!state?.visible) {
        return;
      }

      const latency = readLatency(player);

      player.__squadViewLastLatency =
        latency;

      if (latency === null) {
        /*
         * Some browsers do not expose the latency stat.
         * Do not reload a healthy stream just because
         * telemetry is unavailable.
         */
        player.__squadViewLiveEdgeStatus =
          'latency_unavailable';

        player.__squadViewAwaitingLiveEdge =
          false;

        return;
      }

      if (
        latency <=
        LIVE_EDGE_MAX_LATENCY_SECONDS
      ) {
        player.__squadViewLiveEdgeStatus =
          'live';

        player.__squadViewAwaitingLiveEdge =
          false;

        return;
      }

      player.__squadViewLiveEdgeStatus =
        'stale';

      forceLiveResync(
        player,
        stateRef,
        latency,
      );
    }, delay);
}

function applyPlayerState(
  player,
  state,
) {
  if (!player) {
    return;
  }

  const {
    channel,
    active,
    audioSelected,
    audioEnabled,
    visible,
    visibleCount = 1,
  } = state;

  const audible =
    Boolean(
      audioSelected &&
      audioEnabled &&
      (visible || active),
    );

  const wasVisible =
    player.__squadViewWasVisible;

  const schedulerPaused =
    Boolean(
      player.__squadViewPausedByScheduler,
    );

  /*
   * Always mute before any programmatic playback.
   * This avoids unmuted autoplay restrictions.
   */
  try {
    player.setMuted?.(true);
    player.setVolume?.(0);
  } catch {
    // Twitch may still be initializing.
  }

  if (!visible) {
    clearLiveEdgeTimers(player);

    if (active && audible) {
      /*
       * The focused stream owns the viewer's primary audio. When the user
       * pages through another group, keep that focused stream playing in the
       * background so its audio is continuous. Other off-page streams still
       * use the normal scheduler pause/mute behavior below.
       */
      try {
        if (player.isPaused?.() === true) {
          player.play?.();
        }
        player.setMuted?.(false);
        player.setVolume?.(1);
      } catch {
        // Twitch may still be applying the page transition.
      }

      player.__squadViewPausedByScheduler =
        false;

      player.__squadViewWasVisible = false;

      player.__squadViewAwaitingLiveEdge =
        false;

      player.__squadViewLiveEdgeStatus =
        'focused_audio_background';

      player.__squadViewState = {
        channel,
        active,
        audioSelected,
        audioEnabled,
        visible,
        visibleCount,
        targetQuality:
          player.__squadViewQualityTarget ||
          '',
      };

      return;
    }

    try {
      if (
        player.isPaused?.() !== true
      ) {
        player.pause?.();
      }
    } catch {
      // Player may already be paused.
    }

    player.__squadViewPausedByScheduler =
      true;

    player.__squadViewWasVisible = false;

    player.__squadViewAwaitingLiveEdge =
      false;

    player.__squadViewLiveEdgeStatus =
      'paused_off_page';

    player.__squadViewState = {
      channel,
      active,
      audioSelected,
      audioEnabled,
      visible,
      visibleCount,
      targetQuality:
        player.__squadViewQualityTarget ||
        '',
    };

    return;
  }

  const returningFromHiddenPage =
    wasVisible === false ||
    schedulerPaused;

  if (returningFromHiddenPage) {
    /*
     * This pause was caused by SquadView paging, not
     * by the viewer pressing Twitch's pause control.
     * Resume and allow Twitch to catch back up to live.
     */
    try {
      player.setMuted?.(true);
      player.setVolume?.(0);
      player.play?.();
    } catch {
      // Native Twitch play remains available.
    }

    player.__squadViewAwaitingLiveEdge =
      true;

    player.__squadViewLiveEdgeStatus =
      'syncing_to_live';

    scheduleLiveEdgeCheck(
      player,
      player.__squadViewStateRef,
    );
  }

  applyQualityPolicy(
    player,
    active,
    visibleCount,
  );

  /*
   * Restore audio only after playback/resource state
   * has been handled.
   */
  try {
    player.setMuted?.(!audible);
    player.setVolume?.(
      audible ? 1 : 0,
    );
  } catch {
    // Player may still be starting.
  }

  player.__squadViewPausedByScheduler =
    false;

  player.__squadViewWasVisible = true;

  player.__squadViewState = {
    channel,
    active,
    audioSelected,
    audioEnabled,
    visible,
    visibleCount,
    targetQuality:
      player.__squadViewQualityTarget ||
      '',
  };
}

if (typeof window !== 'undefined') {
  window.__squadViewPlayerDebug =
    () =>
      [...debugPlayers.entries()].map(
        ([
          channel,
          { player, stateRef },
        ]) => {
          const state =
            stateRef.current || {};

          const stats =
            readPlaybackStats(player);

          const latency = Number(
            stats.hlsLatencyBroadcaster,
          );

          return {
            channel,

            visible:
              Boolean(state.visible),

            focused:
              Boolean(state.active),

            visibleCount:
              state.visibleCount || 0,

            paused:
              safeRead(
                () =>
                  player.isPaused?.(),
                null,
              ),

            muted:
              safeRead(
                () =>
                  player.getMuted?.(),
                null,
              ),

            quality:
              safeRead(
                () =>
                  player.getQuality?.(),
                '',
              ),

            targetQuality:
              player.__squadViewQualityTarget ||
              '',

            availableQualities:
              getQualities(player).join(
                ', ',
              ),

            bitrateKbps:
              stats.playbackRate ?? null,

            videoResolution:
              stats.videoResolution ??
              null,

            displayResolution:
              stats.displayResolution ??
              null,

            fps:
              stats.fps ?? null,

            skippedFrames:
              stats.skippedFrames ?? null,

            bufferSeconds:
              stats.bufferSize ?? null,

            latencyToBroadcaster:
              Number.isFinite(latency)
                ? latency
                : null,

            liveEdgeStatus:
              player.__squadViewLiveEdgeStatus ||
              'unknown',

            forcedLiveResyncs:
              player.__squadViewForcedResyncCount ||
              0,
          };
        },
      );
}

export default function TwitchPlayer({
  channel,
  visible,
  visibleCount = 1,
  active,
  audioSelected,
  audioEnabled,
  onListen,
  onFocus,
  isTwitchFollowed = false,
  isFavorite = false,
  onToggleFavorite,
  onRemove,
  registerPlayer,
  tileOrder,
  gridColumn,
  gridRow,
  chatCovered = false,
}) {
  const mountRef = useRef(null);
  const playerRef = useRef(null);

  const stateRef = useRef({
    channel,
    active,
    audioSelected,
    audioEnabled,
    visible,
    visibleCount,
  });

  const [status, setStatus] =
    useState('Loading');

  useEffect(() => {
    stateRef.current = {
      channel,
      active,
      audioSelected,
      audioEnabled,
      visible,
      visibleCount,
    };

    applyPlayerState(
      playerRef.current,
      stateRef.current,
    );
  }, [
    channel,
    active,
    audioSelected,
    audioEnabled,
    visible,
    visibleCount,
  ]);

  useEffect(() => {
    let cancelled = false;

    let qualityRetryTimer = null;

    loadTwitchScript()
      .then((Twitch) => {
        if (
          cancelled ||
          !mountRef.current
        ) {
          return;
        }

        mountRef.current.innerHTML = '';

        const player =
          new Twitch.Player(
            mountRef.current,
            {
              channel,
              parent: [
                window.location.hostname,
              ],
              width: 400,
              height: 300,
              autoplay: Boolean(
                stateRef.current.visible,
              ),
              muted: true,
              controls: true,
            },
          );

        playerRef.current = player;

        player.__squadViewStateRef =
          stateRef;

        player.__squadViewWasVisible =
          Boolean(
            stateRef.current.visible,
          );

        player.__squadViewPausedByScheduler =
          false;

        player.__squadViewForcedResyncCount =
          0;

        player.__squadViewLiveEdgeStatus =
          'initializing';

        registerPlayer(
          channel,
          player,
        );

        debugPlayers.set(channel, {
          player,
          stateRef,
        });

        const refreshPlayerState =
          () => {
            if (cancelled) {
              return;
            }

            applyPlayerState(
              player,
              stateRef.current,
            );
          };

        player.addEventListener(
          Twitch.Player.READY,
          () => {
            setStatus('Ready');

            refreshPlayerState();

            qualityRetryTimer =
              window.setTimeout(
                refreshPlayerState,
                1200,
              );
          },
        );

        player.addEventListener(
          Twitch.Player.PLAY,
          () => {
            setStatus('Playing');
          },
        );

        player.addEventListener(
          Twitch.Player.PLAYING,
          () => {
            setStatus('Playing');

            refreshPlayerState();

            if (
              player.__squadViewAwaitingLiveEdge
            ) {
              scheduleLiveEdgeCheck(
                player,
                stateRef,
              );
            }
          },
        );

        player.addEventListener(
          Twitch.Player.SEEK,
          () => {
            /*
             * Twitch documents SEEK on live content when
             * playback syncs back up after being paused.
             */
            player.__squadViewLiveEdgeStatus =
              'live_seek_sync';

            player.__squadViewAwaitingLiveEdge =
              true;

            scheduleLiveEdgeCheck(
              player,
              stateRef,
              LIVE_EDGE_SEEK_CHECK_DELAY_MS,
            );
          },
        );

        player.addEventListener(
          Twitch.Player.PAUSE,
          () => {
            setStatus('Paused');
          },
        );

        player.addEventListener(
          Twitch.Player.OFFLINE,
          () => {
            setStatus('Offline');

            player.__squadViewLiveEdgeStatus =
              'offline';
          },
        );

        player.addEventListener(
          Twitch.Player.ONLINE,
          () => {
            setStatus('Live');

            refreshPlayerState();
          },
        );

        player.addEventListener(
          Twitch.Player.PLAYBACK_BLOCKED,
          () => {
            setStatus(
              'Tap Twitch play',
            );

            player.__squadViewLiveEdgeStatus =
              'playback_blocked';
          },
        );
      })
      .catch(() => {
        setStatus(
          'Player unavailable',
        );
      });

    return () => {
      cancelled = true;

      if (qualityRetryTimer) {
        window.clearTimeout(
          qualityRetryTimer,
        );
      }

      clearLiveEdgeTimers(
        playerRef.current,
      );

      registerPlayer(
        channel,
        null,
      );

      debugPlayers.delete(channel);

      try {
        playerRef.current?.setMuted?.(
          true,
        );

        playerRef.current?.setVolume?.(
          0,
        );

        playerRef.current?.pause?.();
      } catch {
        // Twitch may already have disposed the iframe.
      }

      playerRef.current = null;
    };
  }, [
    channel,
    registerPlayer,
  ]);

  const listening =
    visible &&
    audioSelected &&
    audioEnabled;

  function handleListen() {
    /*
     * Listen is a per-stream toggle. Explicit viewer interaction may start
     * playback for a stream being added to the audible mix.
     */
    try {
      playerRef.current?.setMuted?.(
        true,
      );

      playerRef.current?.play?.();
    } catch {
      // Native Twitch play remains available.
    }

    onListen();
  }

  return (
    <article
      className={`stream-card ${
        visible
          ? 'is-visible'
          : 'is-hidden'
      } ${
        active
          ? 'is-active'
          : ''
      } ${chatCovered ? 'is-chat-covered' : ''}`}
      aria-label={`${channel} Twitch stream`}
      aria-hidden={chatCovered ? 'true' : undefined}
      style={{
        ...(Number.isFinite(tileOrder) ? { order: tileOrder } : {}),
        ...(Number.isFinite(gridColumn) ? { gridColumn } : {}),
        ...(Number.isFinite(gridRow) ? { gridRow } : {}),
      }}
    >
      <header className="stream-card-header">
        <span className="live-dot" />

        <strong>{channel}</strong>

        {isTwitchFollowed && (
          <span
            className="twitch-follow-state"
            title="Confirmed from your connected Twitch account"
          >
            ✓ Following on Twitch
          </span>
        )}

        <small>{status}</small>

        <button
          type="button"
          className="remove-stream-chip"
          onClick={onRemove}
          aria-label={`Remove ${channel} from this group`}
          title="Remove from this group"
        >
          <span aria-hidden="true">
            ×
          </span>
        </button>

        <div className="stream-card-actions">
          <button
            type="button"
            className={`listen-chip ${
              listening
                ? 'is-listening'
                : ''
            }`}
            onClick={handleListen}
          >
            {listening
              ? 'Listening'
              : 'Listen'}
          </button>

          <button
            type="button"
            className={`focus-chip ${active ? 'is-focused' : ''}`}
            onClick={onFocus}
            aria-pressed={active}
            title="Link this stream to SquadView chat"
          >
            {active ? 'Focused' : 'Focus'}
          </button>

          <button
            type="button"
            className={`favorite-chip ${
              isFavorite
                ? 'is-favorite'
                : ''
            }`}
            onClick={
              onToggleFavorite
            }
            aria-label={
              isFavorite
                ? `Remove ${channel} from favorites`
                : `Add ${channel} to favorites`
            }
            title={
              isFavorite
                ? 'Remove favorite streamer'
                : 'Add favorite streamer'
            }
          >
            <span aria-hidden="true">
              {isFavorite
                ? '♥'
                : '♡'}
            </span>
          </button>
        </div>
      </header>

      <div className="player-viewport">
        <div
          className="player-mount"
          ref={mountRef}
        />
      </div>
    </article>
  );
}
