const MEASUREMENT_ID = 'G-25Q1MYPG8Q';
const DATA_LAYER_NAME = 'squadviewDataLayer';

function getDeviceCategory() {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  if (width < 768) return 'mobile';
  if (width < 1100) return 'tablet';
  return 'desktop';
}

export function getStreamCountBucket(count) {
  if (count <= 1) return '1';
  if (count <= 3) return '2-3';
  if (count <= 6) return '4-6';
  return '7+';
}

export function initializeAnalytics() {
  if (typeof window === 'undefined') return;

  window[DATA_LAYER_NAME] = window[DATA_LAYER_NAME] || [];
  window.dataLayer = window.dataLayer || [];

  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };
}

export function trackEvent(eventName, parameters = {}) {
  if (typeof window === 'undefined') return;

  const payload = {
    event: eventName,
    timestamp: new Date().toISOString(),
    device_category: getDeviceCategory(),
    ...parameters,
  };

  window[DATA_LAYER_NAME] = window[DATA_LAYER_NAME] || [];
  window[DATA_LAYER_NAME].push(payload);

  if (typeof window.gtag === 'function') {
    const { event, timestamp, ...gaParameters } = payload;
    window.gtag('event', eventName, gaParameters);
  }

  if (import.meta.env.DEV || import.meta.env.VITE_ANALYTICS_DEBUG === 'true') {
    console.info('[SquadView analytics]', payload);
  }
}
