import { useEffect, useRef, useState } from 'react';
import { getCurrentAccountSession, subscribeToAccountChanges } from '../services/accountService';
import {
  LAYOUTS, ownerTwitchLogin, readTournament, subscribeTournament,
} from '../services/tournamentLocalService';
import './tournamentStudio.css';

let twitchScriptPromise;
function getTwitchScript() {
  if (window.Twitch?.Player) return Promise.resolve(window.Twitch);
  if (twitchScriptPromise) return twitchScriptPromise;
  twitchScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://player.twitch.tv/js/embed/v1.js';
    script.async = true;
    script.onload = () => window.Twitch?.Player ? resolve(window.Twitch) : reject(new Error('Twitch player unavailable.'));
    script.onerror = () => reject(new Error('Could not load the Twitch embed script.'));
    document.head.append(script);
  }).catch(e => { twitchScriptPromise = null; throw e; });
  return twitchScriptPromise;
}
function TwitchStagePlayer({ login, enabled, audible }) {
  const slot = useRef(null);
  const player = useRef(null);
  const audibleRef = useRef(audible);
  audibleRef.current = audible;
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    if (!enabled) return undefined;
    setError('');
    getTwitchScript().then(Twitch => {
      if (cancelled || !slot.current) return;
      const id = `svt-player-${Math.random().toString(36).slice(2)}`;
      const holder = document.createElement('div');
      holder.id = id;
      holder.className = 'svt-stage-iframe';
      slot.current.append(holder);
      try {
        const instance = new Twitch.Player(id, {
          channel: login, width: '100%', height: '100%',
          parent: [window.location.hostname], autoplay: true, muted: true,
        });
        player.current = instance;
        instance.addEventListener(Twitch.Player.READY, () => {
          if (!cancelled) {
            // Honor audio unlock/owner after Twitch finishes initializing.
            instance.setVolume?.(audibleRef.current ? 1 : 0);
            instance.setMuted?.(!audibleRef.current);
          }
        });
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Could not load stream.');
      }
    }).catch(e => { if (!cancelled) setError(e?.message || 'Twitch embed error.'); });
    return () => {
      cancelled = true;
      try { player.current?.setMuted?.(true); player.current?.destroy?.(); } catch { /* disposed */ }
      player.current = null;
      if (slot.current) slot.current.replaceChildren();
    };
  }, [login, enabled]);
  useEffect(() => {
    if (!player.current) return;
    try {
      player.current.setVolume?.(audible ? 1 : 0);
      player.current.setMuted?.(!audible);
    } catch { /* Twitch may be initializing */ }
  }, [audible, enabled]);
  return <div className="svt-video" ref={slot}>
    {!enabled && <div className="svt-video-placeholder">◉<span>STREAM PREVIEW</span></div>}
    {enabled && error && <div className="svt-video-error" role="alert">{error}</div>}
  </div>;
}
export default function TournamentBroadcastStagePage() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [scene, setScene] = useState(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [notice, setNotice] = useState('');
  const userId = session?.user?.id || '';
  const hostLogin = ownerTwitchLogin(session?.user);
  useEffect(() => {
    let active = true;
    getCurrentAccountSession().then(value => { if (active) { setSession(value); setReady(true); } })
      .catch(() => { if (active) setReady(true); });
    const unsubscribe = subscribeToAccountChanges(value => { if (active) { setSession(value); setReady(true); } });
    return () => { active = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!userId) { setScene(null); return undefined; }
    setScene(readTournament(userId, hostLogin));
    return subscribeTournament(userId, hostLogin, setScene);
  }, [userId, hostLogin]);
  useEffect(() => {
    const key = event => {
      if (event.key.toLowerCase() === 'h' && !event.metaKey && !event.ctrlKey && !event.altKey &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        setShowControls(show => !show);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  if (!ready || !session?.user?.id || !scene) {
    return <main className="svt-stage-locked"><h1>SquadView Broadcast Stage</h1>
      <p>{!ready ? 'Checking your SquadView login…' : 'Sign in through Broadcast Studio in the same browser profile.'}</p>
      <a href="/dashboard/broadcast">Open Director Console</a></main>;
  }
  const wanted = scene.featured.slice(0, LAYOUTS[scene.layout]).filter(login => login !== hostLogin);
  const audioOwner = audioUnlocked && wanted.includes(scene.audioOwner) ? scene.audioOwner : '';
  const format = scene.layout === 'quad' ? 'FOUR-STREAM' : scene.layout.toUpperCase();
  return <div className="svt-stage" data-svt-stage="true">
    <header className="svt-stage-header"><span>◉ SQUADVIEW BROADCAST</span>
      <div><h1>{scene.title}</h1><small>{format} · {wanted.length} FEATURED</small></div><strong>● PRODUCTION STAGE</strong></header>
    <main className="svt-stage-grid" data-layout={scene.layout}>
      {wanted.length ? wanted.map(login => {
        const player = scene.roster.find(p => p.login === login);
        const team = scene.teams.find(t => t.id === player?.teamId);
        return <article className="svt-stage-tile" key={login}>
          <TwitchStagePlayer login={login} enabled={scene.embedsEnabled} audible={audioOwner === login} />
          <footer><span>{scene.studioMode === 'tournament' ? team?.name || 'COMPETITOR' : 'STREAMER'}</span><strong>@{login}</strong></footer>
        </article>;
      }) : <div className="svt-stage-empty">No streamers featured yet. Choose sources in Broadcast Studio.</div>}
    </main>
    <footer className="svt-stage-bottom"><span>{scene.studioMode === 'tournament' && scene.game ? `${scene.game.toUpperCase()} · ` : ''}SQUADVIEW BROADCAST</span>
      <span>{audioOwner ? `AUDIO · @${audioOwner}` : 'AUDIO MUTED'}</span></footer>
    {showControls && <div className="svt-stage-controls">
      {!audioUnlocked && <button onClick={() => { setAudioUnlocked(true); setNotice('Audio unlocked; select one audible competitor in Director Console.'); }}>Enable stage audio</button>}
      <button onClick={() => setShowControls(false)}>Hide controls for OBS</button><small>Press H to show/hide these controls.</small>
      {notice && <small role="status">{notice}</small>}
    </div>}
  </div>;
}
