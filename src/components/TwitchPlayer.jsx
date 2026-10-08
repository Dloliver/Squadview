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

function applyWarmHiddenQuality(player) {
  const qualities = getQualities(player);
  if (!qualities.length) return player?.__squadViewQualityTarget || '';

  const target =
    qualityAtHeight(qualities, 160) ||
    qualityAtHeight(qualities, 360) ||
    qualities.find((quality) => quality.toLowerCase() === 'auto') ||
    qualities[0] ||
    '';

  if (!target || target === player.__squadViewQualityTarget) return target;
  try {
    player.setQuality?.(target);
    player.__squadViewQualityTarget = target;
  } catch {
    // Twitch can populate quality choices a moment after READY.
  }
  return player.__squadViewQualityTarget || target;
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

  /*
   * iOS audio continuity guard:
   * Twitch's live-edge recovery reloads the embed with setChannel(). On iOS,
   * reloading the Twitch iframe while it owns audio can silently revoke the
   * existing audible media session. The video keeps moving, but audio stays
   * muted until the next user gesture (for example, touching the volume
   * slider). Preserve the selected iOS audio owner's live media session and
   * defer any destructive live-edge resync until that stream is no longer the
   * audio owner.
   */
  if (
    state.preserveAudibleSession &&
    state.audioSelected &&
    state.audioEnabled
  ) {
    player.__squadViewLiveEdgeStatus =
      'stale_audio_owner_preserved';

    player.__squadViewAwaitingLiveEdge =
      true;

    scheduleLiveEdgeCheck(
      player,
      stateRef,
      LIVE_EDGE_RESYNC_COOLDOWN_MS,
    );

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
     * A destructive live-edge reload may briefly silence the embed, but the
     * viewer audio controller is the only authority that restores final audio.
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
        player.play?.();
      } catch {
        // Native Twitch play remains available.
      }

      applyQualityPolicy(
        player,
        latestState.active,
        latestState.visibleCount || 1,
      );

      applyPlayerState(
        player,
        latestState,
      );
      latestState.reconcileAudio?.(latestState.channel, player);

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
    allowBackgroundAudio = false,
    keepPlaybackWarm = false,
    visible,
    visibleCount = 1,
  } = state;

  // Playback scheduling and audio ownership are intentionally separate. This
  // component may pause/resume embeds for performance, but final mute/volume
  // is owned exclusively by App's viewer audio controller.
  const keepAliveForAudio = Boolean(
    audioSelected &&
    audioEnabled &&
    allowBackgroundAudio,
  );

  const wasVisible = player.__squadViewWasVisible;
  const schedulerPaused = Boolean(player.__squadViewPausedByScheduler);

  if (!visible) {
    clearLiveEdgeTimers(player);

    if (keepPlaybackWarm) {
      try {
        if (player.isPaused?.() === true) player.play?.();
        player.setMuted?.(true);
        player.setVolume?.(0);
      } catch {
        // WebKit may be finishing the page transition. Keep the player mounted.
      }

      applyWarmHiddenQuality(player);
      player.__squadViewPausedByScheduler = false;
      player.__squadViewWasVisible = false;
      player.__squadViewWarmHidden = true;
      player.__squadViewAwaitingLiveEdge = false;
      player.__squadViewLiveEdgeStatus = 'warm_off_page';
      player.__squadViewState = {
        channel, active, audioSelected, audioEnabled, allowBackgroundAudio,
        keepPlaybackWarm, visible, visibleCount,
        targetQuality: player.__squadViewQualityTarget || '',
      };
      state.reconcileAudio?.(channel, player);
      return;
    }

    player.__squadViewWarmHidden = false;

    if (keepAliveForAudio) {
      try {
        if (player.isPaused?.() === true) {
          player.play?.();
        }
      } catch {
        // Twitch may still be applying the page transition.
      }

      player.__squadViewPausedByScheduler = false;
      player.__squadViewWasVisible = false;
      player.__squadViewAwaitingLiveEdge = false;
      player.__squadViewLiveEdgeStatus = active
        ? 'focused_audio_background'
        : 'selected_audio_background';

      player.__squadViewState = {
        channel,
        active,
        audioSelected,
        audioEnabled,
        allowBackgroundAudio,
        keepPlaybackWarm,
        visible,
        visibleCount,
        targetQuality: player.__squadViewQualityTarget || '',
      };

      state.reconcileAudio?.(channel, player);
      return;
    }

    try {
      if (player.isPaused?.() !== true) {
        player.pause?.();
      }
    } catch {
      // Player may already be paused.
    }

    player.__squadViewPausedByScheduler = true;
    player.__squadViewWasVisible = false;
    player.__squadViewAwaitingLiveEdge = false;
    player.__squadViewLiveEdgeStatus = 'paused_off_page';

    player.__squadViewState = {
      channel,
      active,
      audioSelected,
      audioEnabled,
      allowBackgroundAudio,
      keepPlaybackWarm,
      visible,
      visibleCount,
      targetQuality: player.__squadViewQualityTarget || '',
    };

    state.reconcileAudio?.(channel, player);
    return;
  }

  const returningFromHiddenPage = wasVisible === false || schedulerPaused;
  const returningFromWarmPage = Boolean(player.__squadViewWarmHidden && !schedulerPaused);

  if (returningFromHiddenPage) {
    if (returningFromWarmPage) {
      player.__squadViewAwaitingLiveEdge = false;
      player.__squadViewLiveEdgeStatus = 'warm_returned';
    } else if (keepAliveForAudio && !schedulerPaused) {
      player.__squadViewAwaitingLiveEdge = false;
      player.__squadViewLiveEdgeStatus = 'audible_stream_returned';
    } else {
      try {
        player.play?.();
      } catch {
        // Native Twitch play remains available.
      }

      player.__squadViewAwaitingLiveEdge = true;
      player.__squadViewLiveEdgeStatus = 'syncing_to_live';

      scheduleLiveEdgeCheck(
        player,
        player.__squadViewStateRef,
      );
    }
  }

  applyQualityPolicy(
    player,
    active,
    visibleCount,
  );

  player.__squadViewPausedByScheduler = false;
  player.__squadViewWasVisible = true;
  player.__squadViewWarmHidden = false;

  player.__squadViewState = {
    channel,
    active,
    audioSelected,
    audioEnabled,
    allowBackgroundAudio,
    keepPlaybackWarm,
    visible,
    visibleCount,
    targetQuality: player.__squadViewQualityTarget || '',
  };

  state.reconcileAudio?.(channel, player);
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

            volume:
              safeRead(
                () =>
                  player.getVolume?.(),
                null,
              ),

            audioSelected:
              Boolean(state.audioSelected),

            audioEnabled:
              Boolean(state.audioEnabled),

            schedulerPaused:
              Boolean(player.__squadViewPausedByScheduler),

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
  highlightActive = active,
  focusActive = false,
  audioSelected,
  audioEnabled,
  audioAudible = false,
  preserveAudibleSession = false,
  mobileSingleAudioMode = false,
  keepPlaybackWarm = false,
  allowBackgroundAudio = false,
  focusVolume = 1,
  audioVolume = 1,
  onVolumeChange,
  onListen,
  onFocus,
  onChat,
  onAudioReconcile,
  onLiveAudioStateChange,
  onStreamStatusChange,
  chatActive = false,
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
    preserveAudibleSession,
    allowBackgroundAudio,
    keepPlaybackWarm,
    focusVolume,
    audioVolume,
    visible,
    visibleCount,
    reconcileAudio: onAudioReconcile,
  });

  const [status, setStatus] =
    useState('Loading');
  const [playerReady, setPlayerReady] = useState(false);
  const [showVolumeControl, setShowVolumeControl] =
    useState(false);
  const [mobileVolumePercent, setMobileVolumePercent] =
    useState(() => Math.round(Math.max(0, Math.min(1, Number(audioVolume) || 0)) * 100));
  // Keep the label synced to what the Twitch player is actually outputting.
  // The parent controller describes the intended audio state, while Twitch's
  // own mute/volume controls can change the live player after that intent was
  // applied. This local read-only signal never writes audio back to Twitch.
  const [liveAudible, setLiveAudible] = useState(Boolean(audioAudible));
  const nativeAudioMismatchCountRef = useRef(0);
  const lastReportedNativeAudioRef = useRef('');

  useEffect(() => {
    onStreamStatusChange?.(channel, status);
  }, [channel, status, onStreamStatusChange]);

  useEffect(() => {
    const sourceVolume = active ? focusVolume : audioVolume;
    const numeric = Number(sourceVolume);
    if (!Number.isFinite(numeric)) return;

    setMobileVolumePercent(
      Math.round(Math.max(0, Math.min(1, numeric)) * 100),
    );
  }, [active, focusVolume, audioVolume]);

  useEffect(() => {
    if (!visible) {
      setLiveAudible(false);
      nativeAudioMismatchCountRef.current = 0;
      lastReportedNativeAudioRef.current = '';
      return undefined;
    }

    // Twitch exposes live getMuted(), getVolume(), and isPaused() reads, but
    // does not expose a volume-change event for the embedded player. Poll every
    // visible player so the label reflects the iframe's real output. If the
    // iframe's mute/volume intent differs from SquadView for two consecutive
    // reads, report that native user change back to the central audio controller
    // so Chat/page changes do not erase it. Pause is status only, not intent.
    setLiveAudible(Boolean(audioAudible));

    const syncLiveAudioStatus = () => {
      const player = playerRef.current;
      if (!player) {
        setLiveAudible(Boolean(audioAudible));
        return;
      }

      try {
        const muted = player.getMuted?.();
        const currentVolume = Number(player.getVolume?.());
        const paused = player.isPaused?.();

        if (Number.isFinite(currentVolume)) {
          const clampedVolume = Math.max(0, Math.min(1, currentVolume));
          const nextPercent = Math.round(clampedVolume * 100);
          const nativeWantsAudio = muted !== true && clampedVolume > 0;
          const actuallyAudible = nativeWantsAudio && paused !== true;

          setMobileVolumePercent((current) => current === nextPercent ? current : nextPercent);
          setLiveAudible(actuallyAudible);

          const expectedWantsAudio = Boolean(audioAudible);
          const intentMismatch = nativeWantsAudio !== expectedWantsAudio;
          nativeAudioMismatchCountRef.current = intentMismatch
            ? nativeAudioMismatchCountRef.current + 1
            : 0;

          const expectedVolume = Math.max(
            0,
            Math.min(1, Number(active ? focusVolume : audioVolume) || 0),
          );
          const audibleVolumeChanged = nativeWantsAudio
            && Math.abs(clampedVolume - expectedVolume) > 0.02;

          const signature = `${muted === true ? 1 : 0}:${nextPercent}`;
          const shouldReport = audibleVolumeChanged
            || nativeAudioMismatchCountRef.current >= 2;

          if (shouldReport && lastReportedNativeAudioRef.current !== signature) {
            lastReportedNativeAudioRef.current = signature;
            nativeAudioMismatchCountRef.current = 0;
            onLiveAudioStateChange?.(channel, {
              muted: muted === true,
              volume: clampedVolume,
            });
          }
          return;
        }

        if (muted === true || paused === true) {
          setLiveAudible(false);
          return;
        }
      } catch {
        // Twitch can briefly reject reads while an iframe is initializing.
      }

      setLiveAudible(Boolean(audioAudible));
    };

    syncLiveAudioStatus();
    const statusTimer = window.setInterval(syncLiveAudioStatus, 300);

    return () => window.clearInterval(statusTimer);
  }, [
    visible,
    audioAudible,
    channel,
    active,
    focusVolume,
    audioVolume,
    onLiveAudioStateChange,
  ]);


  useEffect(() => {
    stateRef.current = {
      channel,
      active,
      audioSelected,
      audioEnabled,
      preserveAudibleSession,
      allowBackgroundAudio,
      keepPlaybackWarm,
      focusVolume,
      audioVolume,
      visible,
      visibleCount,
      reconcileAudio: onAudioReconcile,
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
    preserveAudibleSession,
    allowBackgroundAudio,
    keepPlaybackWarm,
    focusVolume,
    audioVolume,
    visible,
    visibleCount,
    onAudioReconcile,
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

        player.__squadViewPreferredVolume =
          Math.max(
            0,
            Math.min(
              1,
              Number.isFinite(
                Number(stateRef.current.focusVolume),
              )
                ? Number(stateRef.current.focusVolume)
                : 1,
            ),
          );

        player.__squadViewWasVisible =
          Boolean(
            stateRef.current.visible,
          );

        player.__squadViewPausedByScheduler =
          false;

        player.__squadViewForcedResyncCount =
          0;

        player.__squadViewReady = false;
        player.__squadViewWarmHidden = false;

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
            stateRef.current.reconcileAudio?.(channel, player);
          };

        player.addEventListener(
          Twitch.Player.READY,
          () => {
            player.__squadViewReady = true;
            setPlayerReady(true);
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

      if (playerRef.current) playerRef.current.__squadViewReady = false;
      playerRef.current = null;
    };
  }, [
    channel,
    registerPlayer,
  ]);

  // Listening is a live status, not a remembered preference. Off-page streams
  // are never Listening, and a visible Twitch player that is muted or at 0%
  // immediately returns to Listen even if its Listen preference is remembered.
  const listening = Boolean(visible && liveAudible);

  function handleListen() {
    if (mobileSingleAudioMode && !playerReady) return;

    /*
     * The parent owns the complete audio mix. Keep this click as a direct user
     * gesture, but do not pre-mute or otherwise rewrite Twitch audio here.
     * That lets Listen add/remove this stream without disrupting focused audio
     * or another stream the viewer is already listening to.
     */
    onListen();
  }

  function openMobileVolumeControl() {
    const sourceVolume = active ? focusVolume : audioVolume;
    const nextPercent = Math.round(
      Math.max(0, Math.min(1, Number(sourceVolume) || 0)) * 100,
    );

    setMobileVolumePercent(nextPercent);
    setShowVolumeControl((current) => !current);
  }

  // Volume input reports intent to the parent audio controller. The Twitch
  // component itself never writes final mute/volume state from this control.
  function changeMobileVolume(event) {
    const nextPercent = Math.max(
      0,
      Math.min(100, Number(event.target.value) || 0),
    );
    const nextVolume = nextPercent / 100;

    setMobileVolumePercent(nextPercent);
    // Make the label react immediately to SquadView's slider. The live Twitch
    // poll above will correct this optimistic value if the embed reports a
    // different mute state.
    setLiveAudible(Boolean(visible && audioSelected && nextVolume > 0));
    onVolumeChange?.(nextVolume);
  }

  return (
    <article
      className={`stream-card ${
        visible
          ? 'is-visible'
          : keepPlaybackWarm
            ? 'is-hidden is-warm-hidden'
            : 'is-hidden'
      } ${
        highlightActive
          ? 'is-active'
          : ''
      } ${isFavorite ? 'is-favorite' : ''} ${chatCovered ? 'is-chat-covered' : ''}`}
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
          {(active || listening) && (
            <button
              type="button"
              className={`volume-chip ${showVolumeControl ? 'is-open' : ''}`}
              onClick={openMobileVolumeControl}
              aria-label={`Adjust ${channel} volume`}
              aria-expanded={showVolumeControl}
              title="Adjust volume"
            >
              <span aria-hidden="true">🔊</span>
            </button>
          )}

          <button
            type="button"
            className={`listen-chip ${
              listening
                ? 'is-listening'
                : ''
            }`}
            onClick={handleListen}
            disabled={Boolean(mobileSingleAudioMode && !playerReady)}
            aria-disabled={Boolean(mobileSingleAudioMode && !playerReady)}
          >
            {mobileSingleAudioMode && !playerReady
              ? 'Starting…'
              : listening
                ? 'Listening'
                : 'Listen'}
          </button>

          <button
            type="button"
            className={`focus-chip ${focusActive ? 'is-focused' : ''}`}
            onClick={onFocus}
            aria-pressed={focusActive}
            title={focusActive ? 'Return to Grid' : `Focus only on ${channel}`}
          >
            {focusActive ? 'Focused' : 'Focus'}
          </button>

          <button
            type="button"
            className={`chat-chip ${chatActive ? 'is-chatting' : ''}`}
            onClick={onChat}
            aria-pressed={chatActive}
            title={chatActive ? 'Close chat and return to Grid' : `Open ${channel} chat`}
          >
            {chatActive ? 'Chatting' : 'Chat'}
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

      {(active || listening) && showVolumeControl && (
        <div className="stream-volume-popover">
          <span>Volume</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={mobileVolumePercent}
            onChange={changeMobileVolume}
            aria-label={`${channel} volume`}
          />
          <strong>{mobileVolumePercent}%</strong>
          <button
            type="button"
            className="stream-volume-close"
            onClick={() => setShowVolumeControl(false)}
            aria-label="Close volume control"
          >
            ×
          </button>
        </div>
      )}

      <div className="player-viewport">
        <div
          className="player-mount"
          ref={mountRef}
        />
      </div>
    </article>
  );
}
