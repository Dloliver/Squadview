import { useEffect, useMemo, useState } from 'react';
import AdSlot from './ads/AdSlot';
import { AD_CONFIG } from '../config/advertising';

export default function LoadingAd({ onComplete }) {
  const [elapsed, setElapsed] = useState(0);
  const minimum = AD_CONFIG.loadingMinimumSeconds;
  const maximum = AD_CONFIG.loadingMaximumSeconds;
  const remaining = Math.max(0, maximum - elapsed);
  const canContinue = elapsed >= minimum;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (elapsed >= maximum) onComplete();
  }, [elapsed, maximum, onComplete]);

  const progress = useMemo(() => Math.min(100, (elapsed / maximum) * 100), [elapsed, maximum]);

  return (
    <main className="loading-screen">
      <a className="loading-brand" href="/" aria-label="Return to SquadView home">SquadView</a>
      <section className="loading-card">
        <div className="loading-copy">
          <span>Preparing your view</span>
          <h1>Your streams are loading.</h1>
          <p>A short sponsor message helps keep SquadView available without placing ads over active streams.</p>
        </div>

        <AdSlot placement="loading" />

        <div className="loading-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>

        <button className="primary-button loading-continue" onClick={onComplete} disabled={!canContinue}>
          {canContinue ? 'Continue to streams' : `Continue in ${minimum - elapsed}s`}
        </button>
        <small className="loading-limit">Continuing automatically in {remaining}s</small>
      </section>
    </main>
  );
}
