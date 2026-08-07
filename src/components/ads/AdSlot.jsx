import { AD_CONFIG } from '../../config/advertising';

export default function AdSlot({ placement, className = '' }) {
  if (!AD_CONFIG.enabled) return null;

  if (AD_CONFIG.testMode) {
    return (
      <aside className={`ad-slot ad-slot-${placement} ${className}`.trim()} aria-label="Advertisement">
        <span>Advertisement</span>
        <strong>{placement === 'loading' ? 'Sponsor message' : 'Sponsor space'}</strong>
        <small>Test placement — live ads will appear here after provider approval.</small>
      </aside>
    );
  }

  // Live provider code will be inserted here after publisher and slot IDs are approved.
  return <aside className={`ad-slot ad-slot-${placement} ${className}`.trim()} aria-label="Advertisement" />;
}
