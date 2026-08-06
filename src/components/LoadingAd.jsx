import { useEffect, useState } from 'react';

export default function LoadingAd({ onComplete }) {
  const [seconds, setSeconds] = useState(5);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          onComplete();
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [onComplete]);

  return (
    <main className="loading-screen">
      <div className="loading-brand">SquadView</div>
      <section className="ad-card" aria-label="Advertisement placeholder">
        <span>Sponsored</span>
        <div className="ad-art">YOUR AD</div>
        <h2>Promote your game here</h2>
        <p>This slot can later connect to an ad network or promote a Do More release.</p>
      </section>
      <div className="loading-progress">
        <div className="loading-bar"><span style={{ width: `${(5 - seconds) * 20}%` }} /></div>
        <p>Loading your streams… {seconds}s</p>
      </div>
    </main>
  );
}
