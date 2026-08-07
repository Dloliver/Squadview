export const AD_CONFIG = {
  enabled: import.meta.env.VITE_ADS_ENABLED !== 'false',
  testMode: import.meta.env.VITE_ADS_TEST_MODE === 'true',
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
  loadingMinimumSeconds: 5,
  loadingMaximumSeconds: 15,
  loadingCooldownMinutes: 20,
};

const LOADING_AD_KEY = 'squadview:last-loading-ad:v1';

export function shouldShowLoadingAd() {
  if (!AD_CONFIG.enabled) return false;

  try {
    const lastShown = Number(sessionStorage.getItem(LOADING_AD_KEY) || 0);
    const cooldownMs = AD_CONFIG.loadingCooldownMinutes * 60 * 1000;
    return !lastShown || Date.now() - lastShown >= cooldownMs;
  } catch {
    return true;
  }
}

export function markLoadingAdShown() {
  try {
    sessionStorage.setItem(LOADING_AD_KEY, String(Date.now()));
  } catch {
    // The transition still works when sessionStorage is unavailable.
  }
}
