import { useEffect, useRef, useState } from 'react';
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

export default function VastLoadingAd({ source = 'viewer_start', onFinish }) {
  const adContainerRef = useRef(null);
  const contentVideoRef = useRef(null);
  const finishedRef = useRef(false);
  const adsManagerRef = useRef(null);
  const startedRef = useRef(false);
  const [status, setStatus] = useState(AD_CONFIG.testMode ? 'Previewing ad break…' : 'Finding a sponsor…');
  const [started, setStarted] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let startupTimer;
    let hardStopTimer;
    let resizeHandler;
    let adsLoader;

    const finish = (result) => {
      if (finishedRef.current || cancelled) return;
      finishedRef.current = true;

      try {
        adsManagerRef.current?.destroy?.();
      } catch {
        // Ad cleanup must never block the viewer transition.
      }

      trackEvent('squadview_ad_finished', {
        provider: AD_CONFIG.vast.provider,
        result,
        source,
      });
      onFinish?.(result);
    };

    if (AD_CONFIG.testMode) {
      trackEvent('squadview_ad_started', { provider: 'test', source });
      startedRef.current = true;
      setStarted(true);
      setStatus('Test ad break');
      const timer = window.setTimeout(() => finish('test_complete'), AD_CONFIG.vast.testDurationMs);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    const adTagUrl = AD_CONFIG.vast.url;
    if (!adTagUrl) {
      const timer = window.setTimeout(() => finish('not_configured'), 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    startupTimer = window.setTimeout(() => {
      if (!finishedRef.current && !startedRef.current) {
        setShowFallback(true);
        setStatus('The sponsor is taking longer than expected.');
      }
    }, AD_CONFIG.vast.startupFallbackMs);

    hardStopTimer = window.setTimeout(() => finish('hard_timeout'), AD_CONFIG.vast.hardTimeoutMs);

    loadImaSdk()
      .then((ima) => {
        if (cancelled || !ima || !adContainerRef.current || !contentVideoRef.current) {
          finish('sdk_unavailable');
          return;
        }

        const adDisplayContainer = new ima.AdDisplayContainer(
          adContainerRef.current,
          contentVideoRef.current,
        );
        adsLoader = new ima.AdsLoader(adDisplayContainer);

        adsLoader.addEventListener(
          ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
          (event) => {
            if (cancelled) return;

            const renderingSettings = new ima.AdsRenderingSettings();
            renderingSettings.restoreCustomPlaybackStateOnAdBreakComplete = true;

            const adsManager = event.getAdsManager(contentVideoRef.current, renderingSettings);
            adsManagerRef.current = adsManager;

            adsManager.addEventListener(ima.AdEvent.Type.STARTED, () => {
              window.clearTimeout(startupTimer);
              startedRef.current = true;
              setStarted(true);
              setShowFallback(false);
              setStatus('Advertisement');
              trackEvent('squadview_ad_started', {
                provider: AD_CONFIG.vast.provider,
                source,
              });
            });

            adsManager.addEventListener(ima.AdEvent.Type.SKIPPED, () => finish('skipped'));
            adsManager.addEventListener(ima.AdEvent.Type.COMPLETE, () => finish('complete'));
            adsManager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => finish('all_ads_completed'));
            adsManager.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, () => finish('content_resume'));
            adsManager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, (adErrorEvent) => {
              console.warn('SquadView VAST ad manager error.', adErrorEvent.getError?.());
              finish('ad_manager_error');
            });

            resizeHandler = () => {
              const container = adContainerRef.current;
              if (!container || !adsManagerRef.current) return;
              const width = Math.max(320, Math.floor(container.clientWidth || 640));
              const height = Math.max(180, Math.floor(container.clientHeight || width * 9 / 16));
              try {
                adsManagerRef.current.resize(width, height, ima.ViewMode.NORMAL);
              } catch {
                // Resize is best-effort only.
              }
            };
            window.addEventListener('resize', resizeHandler);

            try {
              adDisplayContainer.initialize();
              const container = adContainerRef.current;
              const width = Math.max(320, Math.floor(container?.clientWidth || 640));
              const height = Math.max(180, Math.floor(container?.clientHeight || width * 9 / 16));
              adsManager.init(width, height, ima.ViewMode.NORMAL);
              adsManager.start();
            } catch (error) {
              console.warn('SquadView VAST ad could not start.', error);
              finish('start_error');
            }
          },
          false,
        );

        adsLoader.addEventListener(
          ima.AdErrorEvent.Type.AD_ERROR,
          (adErrorEvent) => {
            console.warn('SquadView VAST ad loader error.', adErrorEvent.getError?.());
            finish('ad_loader_error');
          },
          false,
        );

        const request = new ima.AdsRequest();
        request.adTagUrl = adTagUrl;
        request.linearAdSlotWidth = 640;
        request.linearAdSlotHeight = 360;
        request.nonLinearAdSlotWidth = 640;
        request.nonLinearAdSlotHeight = 150;
        request.setAdWillAutoPlay?.(true);
        request.setAdWillPlayMuted?.(false);

        trackEvent('squadview_ad_requested', {
          provider: AD_CONFIG.vast.provider,
          source,
        });
        adsLoader.requestAds(request);
      })
      .catch((error) => {
        console.warn('SquadView could not initialize the VAST ad SDK.', error);
        finish('sdk_error');
      });

    return () => {
      cancelled = true;
      window.clearTimeout(startupTimer);
      window.clearTimeout(hardStopTimer);
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
      try {
        adsLoader?.destroy?.();
        adsManagerRef.current?.destroy?.();
      } catch {
        // Cleanup is best-effort only.
      }
    };
  }, [onFinish, source]);

  const manuallyContinue = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      adsManagerRef.current?.destroy?.();
    } catch {
      // Viewer transition wins over cleanup.
    }
    trackEvent('squadview_ad_finished', {
      provider: AD_CONFIG.vast.provider,
      result: 'manual_fallback',
      source,
    });
    onFinish?.('manual_fallback');
  };

  return (
    <main className="loading-screen vast-loading-screen" aria-live="polite">
      <a className="loading-brand" href="/">SquadView</a>

      <section className="loading-card vast-loading-card" aria-label="SquadView advertisement">
        <div className="loading-copy">
          <span>Advertisement</span>
          <h1>Your Squad is getting ready.</h1>
          <p>Free viewing sessions may include a short SquadView sponsor break. Twitch and YouTube control any ads inside their own players.</p>
        </div>

        <div className={`vast-ad-frame ${started ? 'is-started' : ''}`} ref={adContainerRef}>
          <video ref={contentVideoRef} className="vast-content-video" playsInline muted aria-hidden="true" />
          {!started && (
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

        {showFallback && !started && (
          <button type="button" className="secondary-button loading-continue" onClick={manuallyContinue}>
            Continue to SquadView
          </button>
        )}
      </section>
    </main>
  );
}
