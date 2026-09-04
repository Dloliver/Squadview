import { useEffect, useMemo, useState } from 'react';
import { trackEvent } from '../analytics/dataLayer';

function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator?.standalone === true
  );
}

function getInstallGuide() {
  if (typeof navigator === 'undefined') {
    return {
      platform: 'unknown',
      isIOS: false,
      title: 'Install SquadView',
      steps: [],
    };
  }

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua)
    || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isWindows = /Windows/i.test(ua);
  const isMac = /Macintosh|Mac OS X/i.test(ua) && !isIOS;

  if (isIOS) {
    return {
      platform: 'ios',
      isIOS: true,
      title: 'Install SquadView on iPhone or iPad',
      steps: [
        'Open SquadView in Safari.',
        'Tap the Share button in Safari.',
        'Choose Add to Home Screen, then tap Add.',
      ],
    };
  }

  if (isAndroid) {
    return { platform: 'android', isIOS: false, title: 'Install SquadView on Android', steps: [] };
  }

  if (isMac) {
    return { platform: 'mac', isIOS: false, title: 'Install SquadView on your Mac', steps: [] };
  }

  if (isWindows) {
    return { platform: 'windows', isIOS: false, title: 'Install SquadView on your PC', steps: [] };
  }

  return { platform: 'desktop', isIOS: false, title: 'Install SquadView', steps: [] };
}

const installBenefits = [
  {
    title: 'One tap access',
    text: 'Open SquadView from your desktop or Home Screen instead of typing the website each time.',
  },
  {
    title: 'A cleaner app experience',
    text: 'Launch SquadView in its own app style window on supported devices and keep it separate from your normal tabs.',
  },
  {
    title: 'Keep your SquadView account',
    text: 'Your Twitch sign in, Saved Squads, and Premium access continue to work in the installed app.',
  },
];

export default function InstallSquadView({
  className = 'install-button',
  label = 'Install app',
  source = 'viewer_header',
  hideWhenInstalled = true,
}) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showIOSSteps, setShowIOSSteps] = useState(false);
  const [isInstalled, setIsInstalled] = useState(isStandaloneDisplay);
  const [installCheckComplete, setInstallCheckComplete] = useState(false);
  const guide = useMemo(getInstallGuide, []);

  useEffect(() => {
    const checkTimer = window.setTimeout(() => setInstallCheckComplete(true), 1200);

    const captureInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setInstallCheckComplete(true);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setShowModal(false);
      setShowIOSSteps(false);
      setIsInstalled(true);
      trackEvent('pwa_installed', {
        install_source: source,
        install_platform: guide.platform,
      });
    };

    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.clearTimeout(checkTimer);
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [guide.platform, source]);

  function openInstallModal() {
    setShowIOSSteps(false);
    setShowModal(true);
    trackEvent('pwa_install_modal_opened', {
      install_source: source,
      install_platform: guide.platform,
      native_prompt_available: Boolean(installPrompt),
    });
  }

  function closeInstallModal() {
    setShowModal(false);
    setShowIOSSteps(false);
  }

  async function handleInstallAction() {
    if (installPrompt) {
      trackEvent('pwa_install_clicked', {
        install_source: source,
        install_platform: guide.platform,
        native_prompt_available: true,
      });

      installPrompt.prompt();
      const choice = await installPrompt.userChoice;

      trackEvent('pwa_install_prompt_result', {
        install_source: source,
        install_platform: guide.platform,
        outcome: choice?.outcome || 'unknown',
      });

      if (choice?.outcome === 'accepted') {
        setInstallPrompt(null);
      }
      return;
    }

    if (guide.isIOS) {
      setShowIOSSteps(true);
      trackEvent('pwa_install_ios_steps_viewed', {
        install_source: source,
        install_platform: guide.platform,
      });
      return;
    }

    trackEvent('pwa_install_unavailable', {
      install_source: source,
      install_platform: guide.platform,
    });
  }

  if (hideWhenInstalled && isInstalled) return null;

  const nativeReady = Boolean(installPrompt);
  const unavailable = installCheckComplete && !nativeReady && !guide.isIOS;

  return (
    <>
      <button type="button" className={className} onClick={openInstallModal}>
        {label}
      </button>

      {showModal && (
        <div
          className="pwa-install-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeInstallModal();
          }}
        >
          <section
            className="pwa-install-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-title"
          >
            <button
              type="button"
              className="pwa-install-close"
              onClick={closeInstallModal}
              aria-label="Close install SquadView"
            >
              ×
            </button>

            <span className="pwa-install-eyebrow">Keep SquadView close</span>
            <h2 id="pwa-install-title">Install SquadView</h2>
            <p className="pwa-install-intro">
              Keep your streams one tap away and come back without having to remember or type squadview.app every time.
            </p>

            <div className="pwa-install-benefits" aria-label="Benefits of installing SquadView">
              {installBenefits.map((benefit) => (
                <div className="pwa-install-benefit" key={benefit.title}>
                  <span className="pwa-install-benefit-mark" aria-hidden="true">✓</span>
                  <div>
                    <strong>{benefit.title}</strong>
                    <span>{benefit.text}</span>
                  </div>
                </div>
              ))}
            </div>

            {showIOSSteps ? (
              <div className="pwa-install-ios-panel">
                <strong>{guide.title}</strong>
                <p>Apple uses Add to Home Screen instead of the same pop-up install window used by Chrome and Edge.</p>
                <ol className="pwa-install-steps">
                  {guide.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </div>
            ) : (
              <div className={`pwa-install-status ${nativeReady ? 'is-ready' : unavailable ? 'is-unavailable' : 'is-checking'}`}>
                {nativeReady && (
                  <>
                    <strong>Ready to install</strong>
                    <span>Your browser will open its secure installation confirmation next.</span>
                  </>
                )}
                {!nativeReady && guide.isIOS && (
                  <>
                    <strong>Available on this device</strong>
                    <span>iPhone and iPad installation uses Safari's Add to Home Screen flow.</span>
                  </>
                )}
                {!nativeReady && !guide.isIOS && !installCheckComplete && (
                  <>
                    <strong>Checking install availability</strong>
                    <span>SquadView is checking whether this browser can open a one tap install prompt.</span>
                  </>
                )}
                {unavailable && (
                  <>
                    <strong>One tap install is not available in this browser yet</strong>
                    <span>You can keep using SquadView normally here while install support is expanded.</span>
                  </>
                )}
              </div>
            )}

            <div className="pwa-install-actions">
              {showIOSSteps ? (
                <button type="button" className="primary-button" onClick={closeInstallModal}>
                  Got it
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleInstallAction}
                  disabled={!nativeReady && !guide.isIOS}
                >
                  {nativeReady
                    ? 'Install SquadView'
                    : guide.isIOS
                      ? 'Show install steps'
                      : installCheckComplete
                        ? 'One tap install coming soon'
                        : 'Checking availability…'}
                </button>
              )}

              <button type="button" className="pwa-install-secondary" onClick={closeInstallModal}>
                Continue in browser
              </button>
            </div>

            <small className="pwa-install-footnote">No separate SquadView account is required to install.</small>
          </section>
        </div>
      )}
    </>
  );
}
