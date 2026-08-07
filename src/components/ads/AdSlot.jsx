import { useEffect, useRef } from 'react';
import { AD_CONFIG } from '../../config/advertising';

export default function AdSlot({ placement, className = '' }) {
  const pushedRef = useRef(false);
  const slotId = AD_CONFIG.slots[placement];
  const format = AD_CONFIG.formats[placement] || 'auto';

  useEffect(() => {
    if (!AD_CONFIG.enabled || AD_CONFIG.testMode || !slotId || pushedRef.current) return;

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushedRef.current = true;
    } catch (error) {
      console.warn(`AdSense ${placement} slot was not initialized.`, error);
    }
  }, [placement, slotId]);

  if (!AD_CONFIG.enabled) return null;

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
    <aside className={`ad-slot ad-slot-live ad-slot-${placement} ${className}`.trim()} aria-label="Advertisement">
      <ins
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
