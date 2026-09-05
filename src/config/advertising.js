export const AD_CONFIG = {
  enabled: import.meta.env.VITE_ADS_ENABLED !== 'false',
  // Legacy display inventory stays off until a display provider is
  // intentionally enabled. Loading-video ads are controlled separately.
  displayEnabled: import.meta.env.VITE_DISPLAY_ADS_ENABLED === 'true',
  // Development defaults to test mode unless explicitly disabled. This keeps
  // localhost from requesting live publisher inventory by accident.
  testMode: import.meta.env.VITE_ADS_TEST_MODE === 'true'
    || (import.meta.env.DEV && import.meta.env.VITE_ADS_TEST_MODE !== 'false'),
  clientId: 'ca-pub-2542993681900296',
  slots: {
    home: '7156528726',
    loading: '6991063106',
    footer: '3276993469',
  },
  formats: {
    home: 'horizontal',
    loading: 'vertical',
    footer: 'horizontal',
  },
  loadingCooldownMinutes: Number(import.meta.env.VITE_LOADING_AD_COOLDOWN_MINUTES || 20),
  vast: {
    provider: 'hilltopads',
    url: String(import.meta.env.VITE_HILLTOPADS_VAST_URL || '').trim(),
    // Do not make a user wait on an ad request that never becomes playable.
    startupWarningMs: 5000,
    startupTimeoutMs: 8000,
    // STARTED is not enough: if ad progress stops, fail open quickly.
    stallTimeoutMs: 8000,
    stallGraceMs: 500,
    progressPollMs: 1000,
    // Final guardrail only. Healthy ads use the provider's normal skip/end flow.
    hardTimeoutMs: 90000,
    testDurationMs: 5000,
  },
};

const LOADING_AD_KEY = 'squadview:last-loading-ad:v2';

export function isLoadingAdConfigured() {
  return AD_CONFIG.enabled && (AD_CONFIG.testMode || Boolean(AD_CONFIG.vast.url));
}

export function shouldShowLoadingAd() {
  if (!isLoadingAdConfigured()) return false;

  try {
    const lastShown = Number(localStorage.getItem(LOADING_AD_KEY) || 0);
    const cooldownMs = Math.max(1, AD_CONFIG.loadingCooldownMinutes) * 60 * 1000;
    return !lastShown || Date.now() - lastShown >= cooldownMs;
  } catch {
    return true;
  }
}

export function markLoadingAdShown() {
  try {
    localStorage.setItem(LOADING_AD_KEY, String(Date.now()));
  } catch {
    // The viewer transition still works when browser storage is unavailable.
  }
}
