import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { chooseCreatorOpeningStreams } from '../services/creatorLiveSelection';
import './creatorPublicSquad.css';

export default function CreatorPublicSquadPage({ slug }) {
  const [view, setView] = useState({ state: 'loading' });
  useEffect(() => {
    let active = true;
    async function open() {
      try {
        if (!supabase) throw new Error('SquadView is not configured.');
        const { data, error } = await supabase.functions.invoke('creator-public-live', { body: { slug } });
        if (error || !data?.ok) {
          if (active) setView({ state: data?.code === 'not_published' ? 'not-published' : 'unavailable' });
          return;
        }
        const liveLogins = new Set(Array.isArray(data.live) ? data.live : []);
        // Only trusted server-confirmed logins are eligible; do not accept a browser-supplied roster.
        const selected = chooseCreatorOpeningStreams({
          roster: [...liveLogins], creatorLogin: '', liveLogins, statusComplete: true,
        });
        if (!active) return;
        if (selected.status !== 'ready') {
          setView({ state: 'none-live', title: data.title });
          return;
        }
        const url = new URL('/watch', window.location.origin);
        url.searchParams.set('channels', selected.channels.join(','));
        url.searchParams.set('active', selected.channels[0]);
        // Replace avoids returning into another resolution loop when clicking Back.
        window.location.replace(url.toString());
      } catch {
        if (active) setView({ state: 'unavailable' });
      }
    }
    void open();
    return () => { active = false; };
  }, [slug]);
  const title = view.state === 'loading' ? 'Finding live streams…'
    : view.state === 'none-live' ? 'No approved streamers are live right now'
    : view.state === 'not-published' ? 'This Squad is not currently active'
    : 'Live status is temporarily unavailable';
  return <main className="creator-public-squad" role="status">
    <div className="creator-public-squad__panel">
      <span className="creator-public-squad__brand">◉ SquadView Creator Squad</span>
      <h1>{title}</h1>
      <p>{view.state === 'loading' ? 'Checking the active published Squad against Twitch.'
        : view.state === 'none-live' ? 'The creator’s roster is saved. Visit again when someone starts streaming.'
        : view.state === 'not-published' ? 'The creator may activate a different Squad later.'
        : 'We could not verify Twitch live status. No unverified streams were opened.'}</p>
      {view.state === 'unavailable' && <button onClick={() => window.location.reload()}>Retry</button>}
      <a href="/watch">Open SquadView</a>
    </div>
  </main>;
}
