import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { AD_CONFIG } from '../../config/advertising';
import { trackEvent } from '../../analytics/dataLayer';

const IMA_SDK_URL = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';
let imaSdkPromise;

function loadImaSdk() {
  if (window.google?.ima) return Promise.resolve(window.google.ima);
  if (imaSdkPromise) return imaSdkPromise;

  imaSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${IMA_SDK_URL}"]`);
    if (existing) {
      if (window.google?.ima) {
        resolve(window.google.ima);
        return;
      }
      existing.addEventListener('load', () => resolve(window.google?.ima), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google IMA SDK failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = IMA_SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.google?.ima);
    script.onerror = () => reject(new Error('Google IMA SDK failed to load.'));
    document.head.appendChild(script);
  });

  return imaSdkPromise;
}

function adLog(message, detail) {
  // Never log the publisher tag URL. These diagnostics are safe to keep in
  // production and make live VAST failures much easier to isolate.
  if (detail === undefined) console.info(`[SquadView Ads] ${message}`);
  else console.info(`[SquadView Ads] ${message}`, detail);
}

const VastLoadingAd = forwardRef(function VastLoadingAd(
  {
    source = 'viewer_start',
    onFinish,
    preload = false,
  },
  ref,
) {
  const rootRef = useRef(null);
  const playerShellRef = useRef(null);
  const adContainerRef = useRef(null);
  const contentPlaybackRef = useRef({ currentTime: 0 });
  const onFinishRef = useRef(onFinish);
  const sourceRef = useRef(source);

  const imaRef = useRef(null);
  const adsLoaderRef = useRef(null);
  const adsManagerRef = useRef(null);
  const adDisplayContainerRef = useRef(null);

  const activeRef = useRef(!preload);
  const finishedRef = useRef(false);
  const requestStartedRef = useRef(false);
  const preloadFailedRef = useRef(false);
  const displayInitializedRef = useRef(false);
  const managerInitializedRef = useRef(false);
  const playbackRequestedRef = useRef(false);
  const startedRef = useRef(false);
  const queuedStartRef = useRef(preload ? null : 'auto');

  const startupWarningTimerRef = useRef(null);
  const startupTimeoutTimerRef = useRef(null);
  const stallTimerRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const hardStopTimerRef = useRef(null);

  const [active, setActive] = useState(!preload);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState(
    AD_CONFIG.testMode
      ? (preload ? 'Sponsor ready' : 'Previewing ad break…')
      : (preload ? 'Preparing sponsor…' : 'Finding a sponsor…'),
  );
  const [showFallback, setShowFallback] = useState(false);
  const [muted, setMuted] = useState(!preload);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  const clearLaunchTimers = () => {
    window.clearTimeout(startupWarningTimerRef.current);
    window.clearTimeout(startupTimeoutTimerRef.current);
    window.clearTimeout(stallTimerRef.current);
    window.clearTimeout(hardStopTimerRef.current);
    window.clearInterval(progressIntervalRef.current);
  };

  const showOverlay = () => {
    activeRef.current = true;
    const root = rootRef.current;
    if (root) {
      // Do this synchronously before initialize() so the ad display container
      // is actually visible during the same user gesture that starts a Squad.
      root.classList.add('is-active');
      root.setAttribute('aria-hidden', 'false');
    }
    setActive(true);
  };

  const hideOverlay = () => {
    activeRef.current = false;
    const root = rootRef.current;
    if (root) {
      root.classList.remove('is-active');
      root.setAttribute('aria-hidden', 'true');
    }
    setActive(false);
  };

  const finish = (result) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearLaunchTimers();

    try {
      adsManagerRef.current?.destroy?.();
    } catch {
      // Viewer transition wins over ad cleanup.
    }

    hideOverlay();
    const finishSource = sourceRef.current;
    adLog('break finished', { result, source: finishSource });
    trackEvent('squadview_ad_finished', {
      provider: AD_CONFIG.vast.provider,
      result,
      source: finishSource,
    });
    onFinishRef.current?.(result);
  };

  const getPlayerSize = () => {
    const shell = playerShellRef.current;
    const width = Math.max(320, Math.floor(shell?.clientWidth || window.innerWidth || 640));
    const height = Math.max(180, Math.floor(shell?.clientHeight || width * 9 / 16));
    return { width, height };
  };

  const armLaunchTimeouts = () => {
    clearLaunchTimers();

    startupWarningTimerRef.current = window.setTimeout(() => {
      if (!finishedRef.current && !startedRef.current) {
        setShowFallback(true);
        setStatus('Still looking for a sponsor…');
      }
    }, AD_CONFIG.vast.startupWarningMs);

    startupTimeoutTimerRef.current = window.setTimeout(() => {
      if (!finishedRef.current && !startedRef.current) {
        adLog('startup timed out');
        finish('startup_timeout');
      }
    }, AD_CONFIG.vast.startupTimeoutMs);

    hardStopTimerRef.current = window.setTimeout(() => {
      adLog('hard timeout reached');
      finish('hard_timeout');
    }, AD_CONFIG.vast.hardTimeoutMs);
  };

  const startProgressWatch = () => {
    let lastRemainingTime = null;
    let lastProgressAt = Date.now();
    let progressSeen = false;

    window.clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = window.setInterval(() => {
      if (finishedRef.current || !adsManagerRef.current) return;

      let remaining;
      try {
        remaining = Number(adsManagerRef.current.getRemainingTime?.());
      } catch {
        remaining = Number.NaN;
      }

      if (Number.isFinite(remaining) && remaining >= 0) {
        if (lastRemainingTime === null || remaining < lastRemainingTime - 0.05) {
          lastRemainingTime = remaining;
          lastProgressAt = Date.now();
          setShowFallback(false);
          if (!progressSeen) {
            progressSeen = true;
            adLog('media playback progressing', { remaining_seconds: Math.round(remaining) });
          }
          return;
        }
        lastRemainingTime = remaining;
      }

      if (Date.now() - lastProgressAt >= AD_CONFIG.vast.stallTimeoutMs) {
        window.clearInterval(progressIntervalRef.current);
        setShowFallback(true);
        setStatus('Sponsor video could not continue. Opening your Squad…');
        adLog('media playback stalled');
        trackEvent('squadview_ad_stalled', {
          provider: AD_CONFIG.vast.provider,
          source: sourceRef.current,
        });
        stallTimerRef.current = window.setTimeout(
          () => finish('stalled'),
          AD_CONFIG.vast.stallGraceMs,
        );
      }
    }, AD_CONFIG.vast.progressPollMs);
  };

  const startManager = ({ mutedStart = false, reason = 'prepared' } = {}) => {
    const ima = imaRef.current;
    const adsManager = adsManagerRef.current;
    if (!ima || !adsManager || playbackRequestedRef.current || finishedRef.current) return false;

    try {
      const { width, height } = getPlayerSize();
      if (!managerInitializedRef.current) {
        adsManager.init(width, height, ima.ViewMode.NORMAL);
        managerInitializedRef.current = true;
      } else {
        adsManager.resize?.(width, height, ima.ViewMode.NORMAL);
      }

      adsManager.setVolume?.(mutedStart ? 0 : 1);
      setMuted(mutedStart);
      setShowFallback(false);
      setStatus(mutedStart ? 'Starting sponsor…' : 'Advertisement');
      playbackRequestedRef.current = true;
      adLog(mutedStart ? 'automatic muted playback requested' : 'prepared sponsor playback requested', { reason });
      adsManager.start();
      return true;
    } catch (error) {
      console.warn('[SquadView Ads] sponsor playback failed', {
        name: error?.name || 'Error',
        message: error?.message || String(error),
        reason,
      });
      setShowFallback(true);
      setStatus('Sponsor could not start. Opening your Squad…');
      window.setTimeout(() => finish('start_failed'), AD_CONFIG.vast.stallGraceMs);
      return false;
    }
  };

  const requestAds = ({ autoPlay, mutedRequest }) => {
    const ima = imaRef.current;
    const adsLoader = adsLoaderRef.current;
    if (!ima || !adsLoader || requestStartedRef.current || finishedRef.current) return;

    const adTagUrl = AD_CONFIG.vast.url;
    if (!adTagUrl) {
      preloadFailedRef.current = true;
      if (activeRef.current) finish('not_configured');
      return;
    }

    requestStartedRef.current = true;
    adLog('requesting HilltopAds VAST inventory', {
      source: preload ? 'preload' : sourceRef.current,
    });

    const request = new ima.AdsRequest();
    request.adTagUrl = adTagUrl;
    request.linearAdSlotWidth = 640;
    request.linearAdSlotHeight = 360;
    request.nonLinearAdSlotWidth = 640;
    request.nonLinearAdSlotHeight = 150;
    request.setAdWillAutoPlay?.(Boolean(autoPlay));
    request.setAdWillPlayMuted?.(Boolean(mutedRequest));
    request.setContinuousPlayback?.(false);

    trackEvent('squadview_ad_requested', {
      provider: AD_CONFIG.vast.provider,
      source: preload ? 'preload' : sourceRef.current,
    });
    adsLoader.requestAds(request);
  };

  const startPreparedAd = (nextSource = 'builder') => {
    sourceRef.current = nextSource;

    if (finishedRef.current || preloadFailedRef.current) return false;

    if (AD_CONFIG.testMode) {
      showOverlay();
      armLaunchTimeouts();
      startedRef.current = true;
      setStarted(true);
      setMuted(false);
      setStatus('Test ad break');
      adLog('prepared test break started', { source: nextSource });
      trackEvent('squadview_ad_started', { provider: 'test', source: nextSource });
      window.clearTimeout(startupWarningTimerRef.current);
      window.clearTimeout(startupTimeoutTimerRef.current);
      window.setTimeout(() => finish('test_complete'), AD_CONFIG.vast.testDurationMs);
      return true;
    }

    // The only hard prerequisite for the seamless path is that the IMA display
    // container already exists. It is created while the user is building the
    // roster. initialize() is then called directly from the same click that
    // starts the Squad, satisfying mobile browser gesture requirements without
    // a second "Play sponsor" tap.
    if (!adDisplayContainerRef.current) {
      adLog('prepared sponsor skipped because IMA was not ready');
      return false;
    }

    showOverlay();
    armLaunchTimeouts();
    queuedStartRef.current = 'gesture';

    try {
      adDisplayContainerRef.current.initialize?.();
      displayInitializedRef.current = true;
      adLog('IMA display container initialized from Squad start gesture', { source: nextSource });
    } catch (error) {
      console.warn('[SquadView Ads] gesture initialization failed', {
        name: error?.name || 'Error',
        message: error?.message || String(error),
      });
      hideOverlay();
      return false;
    }

    // If VAST parsing finished while the user was building the Squad, playback
    // starts immediately. Otherwise ADS_MANAGER_LOADED will start it as soon as
    // the already-initialized request is ready.
    if (adsManagerRef.current) {
      startManager({ mutedStart: false, reason: 'squad_start_gesture' });
    } else {
      setStatus('Preparing sponsor…');
    }

    return true;
  };

  useImperativeHandle(ref, () => ({
    startPreparedAd,
  }));

  useEffect(() => {
    let cancelled = false;
    let resizeHandler;

    if (AD_CONFIG.testMode) {
      if (!preload) {
        showOverlay();
        armLaunchTimeouts();
        startedRef.current = true;
        setStarted(true);
        setStatus('Test ad break');
        trackEvent('squadview_ad_started', { provider: 'test', source: sourceRef.current });
        const timer = window.setTimeout(() => finish('test_complete'), AD_CONFIG.vast.testDurationMs);
        return () => {
          cancelled = true;
          window.clearTimeout(timer);
          clearLaunchTimers();
        };
      }
      return () => {
        cancelled = true;
        clearLaunchTimers();
      };
    }

    loadImaSdk()
      .then((ima) => {
        if (cancelled || !ima || !adContainerRef.current) return;
        imaRef.current = ima;

        const adDisplayContainer = new ima.AdDisplayContainer(adContainerRef.current);
        adDisplayContainerRef.current = adDisplayContainer;
        const adsLoader = new ima.AdsLoader(adDisplayContainer);
        adsLoaderRef.current = adsLoader;

        adsLoader.addEventListener(
          ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
          (event) => {
            if (cancelled || finishedRef.current) return;
            adLog('ads manager loaded', { preloaded: preload });

            const renderingSettings = new ima.AdsRenderingSettings();
            renderingSettings.restoreCustomPlaybackStateOnAdBreakComplete = true;

            const adsManager = event.getAdsManager(contentPlaybackRef.current, renderingSettings);
            adsManagerRef.current = adsManager;

            adsManager.addEventListener(ima.AdEvent.Type.STARTED, () => {
              window.clearTimeout(startupWarningTimerRef.current);
              window.clearTimeout(startupTimeoutTimerRef.current);
              startedRef.current = true;
              setStarted(true);
              setShowFallback(false);
              setStatus('Advertisement');
              adLog('ad STARTED event received');
              startProgressWatch();
              trackEvent('squadview_ad_started', {
                provider: AD_CONFIG.vast.provider,
                source: sourceRef.current,
              });
            });

            adsManager.addEventListener(ima.AdEvent.Type.SKIPPED, () => finish('skipped'));
            adsManager.addEventListener(ima.AdEvent.Type.COMPLETE, () => finish('complete'));
            adsManager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => finish('all_ads_completed'));
            adsManager.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, () => finish('content_resume'));
            adsManager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, (adErrorEvent) => {
              const error = adErrorEvent.getError?.();
              console.warn('[SquadView Ads] ad manager error', {
                code: error?.getErrorCode?.(),
                message: error?.getMessage?.() || error?.message,
              });
              finish('ad_manager_error');
            });

            resizeHandler = () => {
              if (!adsManagerRef.current || !activeRef.current) return;
              const { width, height } = getPlayerSize();
              try {
                adsManagerRef.current.resize(width, height, ima.ViewMode.NORMAL);
              } catch {
                // Resize is best-effort only.
              }
            };
            window.addEventListener('resize', resizeHandler);

            if (queuedStartRef.current === 'gesture' && displayInitializedRef.current) {
              startManager({ mutedStart: false, reason: 'manager_ready_after_gesture' });
            } else if (!preload && queuedStartRef.current === 'auto') {
              // Shared links do not have a Start Squad click to borrow. Attempt
              // muted autoplay and fail open if the browser refuses it.
              try {
                adDisplayContainer.initialize?.();
                displayInitializedRef.current = true;
              } catch {
                // startManager/stall protection will fail open if needed.
              }
              startManager({ mutedStart: true, reason: 'standalone_autoplay' });
            } else if (preload) {
              setStatus('Sponsor ready');
              adLog('sponsor parsed and ready for Squad start gesture');
            }
          },
          false,
        );

        adsLoader.addEventListener(
          ima.AdErrorEvent.Type.AD_ERROR,
          (adErrorEvent) => {
            const error = adErrorEvent.getError?.();
            console.warn('[SquadView Ads] ad loader error', {
              code: error?.getErrorCode?.(),
              message: error?.getMessage?.() || error?.message,
              preloaded: preload,
            });

            preloadFailedRef.current = true;
            if (activeRef.current) finish('ad_loader_error');
            else adLog('preloaded sponsor unavailable; next viewer start will fail open');
          },
          false,
        );

        if (preload) {
          // Strong intent signal: the user has already selected a stream or has
          // a live Saved Squad. Parse VAST now so their eventual Start click can
          // initialize and begin playback in one seamless gesture.
          requestAds({ autoPlay: false, mutedRequest: false });
        } else {
          showOverlay();
          armLaunchTimeouts();
          requestAds({ autoPlay: true, mutedRequest: true });
        }
      })
      .catch((error) => {
        console.warn('[SquadView Ads] IMA SDK initialization error', {
          name: error?.name || 'Error',
          message: error?.message || String(error),
          preloaded: preload,
        });
        preloadFailedRef.current = true;
        if (activeRef.current) finish('sdk_error');
      });

    return () => {
      cancelled = true;
      clearLaunchTimers();
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
      try {
        adsLoaderRef.current?.destroy?.();
        adsManagerRef.current?.destroy?.();
      } catch {
        // Cleanup is best-effort only.
      }
    };
  }, [preload]);

  const manuallyContinue = () => {
    if (finishedRef.current) return;
    finish('manual_fallback');
  };

  const toggleSound = () => {
    const manager = adsManagerRef.current;
    if (!manager) return;
    const nextMuted = !muted;
    try {
      manager.setVolume?.(nextMuted ? 0 : 1);
      setMuted(nextMuted);
      adLog(nextMuted ? 'ad muted' : 'ad sound enabled');
    } catch {
      // Sound control is optional and must never affect playback.
    }
  };

  return (
    <div
      ref={rootRef}
      className={`loading-screen vast-loading-screen ${preload ? 'vast-preloaded-shell' : ''} ${active ? 'is-active' : ''} ${started ? 'is-ad-started' : ''}`}
      aria-live={active ? 'polite' : 'off'}
      aria-hidden={active ? 'false' : 'true'}
    >
      <a className="loading-brand" href="/">SquadView</a>

      <section className="loading-card vast-loading-card" aria-label="SquadView advertisement">
        <div className="loading-copy">
          <span>Advertisement</span>
          <h1>Your Squad is getting ready.</h1>
          <p>Free viewing sessions may include a short SquadView sponsor break. Twitch and YouTube control any ads inside their own players.</p>
        </div>

        <div className={`vast-ad-frame ${started ? 'is-started' : ''}`} ref={playerShellRef}>
          <div ref={adContainerRef} className="vast-ima-container" aria-label="Advertisement player" />
          {active && !started && (
            <div className="vast-ad-waiting">
              <span className="vast-ad-spinner" aria-hidden="true" />
              <strong>{status}</strong>
              <small>Your streams will open automatically.</small>
            </div>
          )}
        </div>

        <div className="vast-loading-status">
          <span>{status}</span>
          <small>Premium members skip SquadView supplied ads.</small>
        </div>

        <div className="vast-ad-actions">
          {started && (
            <button type="button" className="secondary-button loading-sound" onClick={toggleSound}>
              {muted ? 'Sound on' : 'Mute'}
            </button>
          )}

          {showFallback && (
            <button type="button" className="secondary-button loading-continue" onClick={manuallyContinue}>
              Continue to SquadView
            </button>
          )}
        </div>
      </section>
    </div>
  );
});

export default VastLoadingAd;
