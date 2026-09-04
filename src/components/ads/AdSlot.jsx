import { useEffect, useRef } from 'react';
import { AD_CONFIG } from '../../config/advertising';

export default function AdSlot({ placement, className = '' }) {
  const pushedRef = useRef(false);
  const wrapperRef = useRef(null);
  const adElementRef = useRef(null);
  const slotId = AD_CONFIG.slots[placement];
  const format = AD_CONFIG.formats[placement] || 'auto';

  // Request the ad once the visible slot is mounted.
  useEffect(() => {
    if (!AD_CONFIG.displayEnabled || AD_CONFIG.testMode || !slotId || pushedRef.current) return;

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushedRef.current = true;
    } catch (error) {
      console.warn(`AdSense ${placement} slot was not initialized.`, error);
    }
  }, [placement, slotId]);

  // AdSense adds data-ad-status after the request completes. If Google returns
  // no ad, collapse our wrapper too so its reserved min-height does not leave a
  // large blank bar on the page. Keep the slot visible while it is requesting.
  useEffect(() => {
    if (!AD_CONFIG.displayEnabled || AD_CONFIG.testMode || !slotId) return undefined;

    const adElement = adElementRef.current;
    const wrapper = wrapperRef.current;
    if (!adElement || !wrapper) return undefined;

    const syncStatus = () => {
      const status = adElement.getAttribute('data-ad-status');
      wrapper.classList.toggle('ad-slot-collapsed', status === 'unfilled');
    };

    syncStatus();
    const observer = new MutationObserver(syncStatus);
    observer.observe(adElement, {
      attributes: true,
      attributeFilter: ['data-ad-status'],
    });

    return () => observer.disconnect();
  }, [slotId]);

  if (!AD_CONFIG.displayEnabled) return null;

  if (AD_CONFIG.testMode) {
    const labels = {
      home: 'Sponsor space',
      loading: 'Sponsor message',
      footer: 'More from our sponsors',
    };

    return (
      <aside className={`ad-slot ad-slot-${placement} ${className}`.trim()} aria-label="Advertisement">
        <span>Advertisement</span>
        <strong>{labels[placement] || 'Sponsor space'}</strong>
        <small>Test placement — live ads are disabled in this build.</small>
      </aside>
    );
  }

  if (!slotId) return null;

  return (
    <aside
      ref={wrapperRef}
      className={`ad-slot ad-slot-live ad-slot-${placement} ${className}`.trim()}
      aria-label="Advertisement"
    >
      <ins
        ref={adElementRef}
        className="adsbygoogle"
        style={{ display: 'block', width: '100%' }}
        data-ad-client={AD_CONFIG.clientId}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </aside>
  );
}
