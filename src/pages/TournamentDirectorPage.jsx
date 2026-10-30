import { useEffect, useMemo, useState } from 'react';
import {
  getCurrentAccountSession, isSquadViewAuthConfigured, loadSquadViewUserState,
  signInWithTwitch, subscribeToAccountChanges,
} from '../services/accountService';
import { loadFollowedChannels, loadFollowedLiveStreams } from '../services/twitchFollowingService';
import {
  FORMATS, LAYOUTS, MAX_PRESETS, appendCompetitors, cleanTwitchLogin,
  initialTournament, normalizeFollowedChannels, ownerTwitchLogin,
  readTournament, subscribeTournament, writeTournament, teamSceneFor,
  switcherScene, switcherLayout, switcherSetSlot, switcherSameScene,
} from '../services/tournamentLocalService';
import TournamentSwitcherPanel from './TournamentSwitcherPanel';
import './tournamentStudio.css';

const formats = [
  ['solo', 'Solo'], ['duos', 'Duos'], ['trios', 'Trios'],
  ['squads', 'Squads of 4'], ['custom', 'Custom team size'],
];
const layouts = [
  ['spotlight', 'Spotlight', '1'], ['versus', 'Versus', '2'],
  ['trio', 'Trios', '3'], ['quad', 'Four streams', '4'],
];
function useDirectorSession() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    getCurrentAccountSession().then(value => {
      if (live) { setSession(value); setReady(true); }
    }).catch(e => { if (live) { setError(e?.message || 'Unable to check login.'); setReady(true); } });
    const unsubscribe = subscribeToAccountChanges(value => {
      if (live) { setSession(value); setReady(true); setError(''); }
    });
    return () => { live = false; unsubscribe(); };
  }, []);
  return { session, ready, error };
}
export default function TournamentDirectorPage() {
  const { session, ready, error: authError } = useDirectorSession();
  const userId = session?.user?.id || '';
  const hostLogin = ownerTwitchLogin(session?.user);
  const [model, setModel] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const [bulk, setBulk] = useState('');
  const [presetName, setPresetName] = useState('');
  // Preview is isolated from the persisted Program scene used by OBS.
  const [previewDraft, setPreviewDraft] = useState(null);
  const [activeSlot, setActiveSlot] = useState(0);
  const [picker, setPicker] = useState('following');
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [following, setFollowing] = useState([]);
  const [followingStatus, setFollowingStatus] = useState('idle');
  const [followingError, setFollowingError] = useState('');
  const [liveLogins, setLiveLogins] = useState(new Set());
  const [liveStatus, setLiveStatus] = useState('idle');

  useEffect(() => {
    if (!userId) { setModel(null); return undefined; }
    setModel(readTournament(userId, hostLogin));
    return subscribeTournament(userId, hostLogin, setModel);
  }, [userId, hostLogin]);
  useEffect(() => {
    if (!userId) { setFavorites([]); setFollowing([]); return undefined; }
    let active = true;
    loadSquadViewUserState(userId).then(state => {
      if (!active) return;
      const list = state?.favorite_streamers || state?.favoriteStreamers || [];
      setFavorites([...new Set((Array.isArray(list) ? list : []).map(cleanTwitchLogin).filter(Boolean))]);
    }).catch(() => { if (active) setFavorites([]); });
    setFollowingStatus('loading'); setFollowingError('');
    loadFollowedChannels().then(result => {
      if (active) { setFollowing(normalizeFollowedChannels(result)); setFollowingStatus('ready'); }
    }).catch(e => {
      if (active) { setFollowingStatus('error'); setFollowingError(e?.message || 'Unable to load Following.'); }
    });
    setLiveStatus('loading');
    loadFollowedLiveStreams().then(streams => {
      if (!active) return;
      const result = new Set();
      for (const item of streams) {
        const obj = typeof item === 'string' ? { login: item } : item || {};
        const login = cleanTwitchLogin(obj.login || obj.user_login || obj.broadcaster_login || obj.channel);
        if (login) result.add(login);
      }
      setLiveLogins(result); setLiveStatus('ready');
    }).catch(() => { if (active) setLiveStatus('unavailable'); });
    return () => { active = false; };
  }, [userId]);

  function change(build, message = 'Broadcast setup updated.') {
    if (!userId || !model) return;
    try {
      const current = readTournament(userId, hostLogin);
      const proposal = typeof build === 'function' ? build(current) : { ...current, ...build };
      const saved = writeTournament(userId, hostLogin, proposal);
      setModel(saved); setError(''); setNotice(message);
      return true;
    } catch (e) { setError(e?.message || 'Unable to save tournament locally.'); return false; }
  }
  function setStudioMode(mode) {
    if (mode !== 'streamer' && mode !== 'tournament') return;
    change(current => ({ ...current, studioMode: mode }),
      mode === 'tournament' ? 'Tournament controls enabled. Existing teams preserved.' : 'Streamer Mode enabled. Existing teams preserved.');
    setPreviewDraft(null);
    setActiveSlot(0);
  }
  function addLogins(raw) {
    const entries = String(raw || '').split(/[\s,;]+/).filter(Boolean);
    if (!entries.length) { setError('Enter at least one Twitch username.'); return; }
    const valid = entries.map(cleanTwitchLogin).filter(Boolean);
    if (!valid.length) { setError('No valid Twitch usernames found.'); return; }
    const current = readTournament(userId, hostLogin);
    const next = appendCompetitors(current, valid, hostLogin);
    if (!next.added) { setError('No new streamers added. Check duplicates or the 16-person limit.'); return; }
    change(next, `${next.added} streamer${next.added === 1 ? '' : 's'} added to roster.`);
    setManual(''); setBulk('');
  }
  function queuePlayer(login) {
    if (login === hostLogin) { setError('The director Twitch channel cannot be rebroadcast into its own OBS stage.'); return; }
    setPreviewDraft(current => switcherSetSlot(current || model, login, activeSlot, model, hostLogin));
    setError(''); setNotice(`Queued @${login} in PREVIEW. Press TAKE to send it to the Broadcast Stage.`);
  }
  function cueTeam(teamId) {
    const scene = teamSceneFor(model, teamId, hostLogin);
    if (!scene) { setError('Assign eligible competitors to this team before previewing it.'); return; }
    setPreviewDraft({ layout: scene.layout, featured: scene.featured });
    setActiveSlot(0); setError(''); setNotice('Team queued in PREVIEW; the Broadcast Stage is unchanged.');
  }
  function takeTeamNow(teamId) {
    const team = model?.teams.find(item => item.id === teamId);
    const scene = teamSceneFor(model, teamId, hostLogin);
    if (!scene) { setError('Assign streamers before taking this team live.'); return; }
    change(current => {
      const latest = teamSceneFor(current, teamId, hostLogin);
      return latest ? { ...current, layout: latest.layout, featured: latest.featured, audioOwner: '' } : current;
    }, `ON AIR: ${team?.name || 'team'}.`);
  }
  function takePreview() {
    const next = switcherScene(previewDraft || model, model, hostLogin);
    if (!next.featured.length) { setError('Preview needs at least one eligible competitor before TAKE.'); return; }
    if (switcherSameScene(next, model, model, hostLogin)) return;
    const previous = switcherScene(model, model, hostLogin);
    const published = change(current => ({ ...current, layout: next.layout, featured: next.featured, audioOwner: '' }), 'TAKE complete: Preview is now on Program. Audio is muted until selected again.');
    if (published) { setPreviewDraft(previous); setActiveSlot(0); }
  }
  function setAssignment(login, teamId) {
    if (!model) return;
    if (teamId && model.roster.filter(p => p.teamId === teamId && p.login !== login).length >= model.teamSize) {
      setError(`That team already has ${model.teamSize} competitors.`); return;
    }
    change(current => ({ ...current, roster: current.roster.map(p => p.login === login ? { ...p, teamId } : p) }), `Assigned @${login}.`);
  }
  const chosen = model?.featured.slice(0, LAYOUTS[model.layout]) || [];
  const previewScene = useMemo(() => model ? switcherScene(previewDraft || model, model, hostLogin) : null, [previewDraft, model, hostLogin]);
  const available = useMemo(() => {
    const source = picker === 'favorites'
      ? favorites.map(login => following.find(p => p.login === login) || { login, label: login, avatar: '' })
      : following;
    return source.filter(item => `${item.login} ${item.label}`.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => Number(liveLogins.has(b.login)) - Number(liveLogins.has(a.login)) || a.label.localeCompare(b.label))
      .slice(0, 100);
  }, [picker, favorites, following, search, liveLogins]);

  if (!isSquadViewAuthConfigured || !ready || !userId || !model) {
    return <div className="svt"><header className="svt-top"><a href="/dashboard">◉ SquadView Creator Studio</a></header>
      <main className="svt-main"><section className="svt-panel"><h1>Broadcast Studio</h1>
        {!isSquadViewAuthConfigured ? <p>SquadView sign-in is not configured.</p>
          : !ready || (userId && !model) ? <p>Checking your account and loading the tournament…</p>
          : <><p>Sign in with your SquadView Twitch account to direct broadcast views.</p>
            <button disabled={busy} onClick={() => { setBusy(true); signInWithTwitch().catch(e => { setError(e?.message || 'Sign-in failed.'); setBusy(false); }); }}>Continue with Twitch</button></>}
        {(error || authError) && <p role="alert" className="svt-error">{error || authError}</p>}
      </section></main></div>;
  }
  return <div className="svt">
    <header className="svt-top"><a href="/dashboard" className="svt-brand">◉ SquadView <strong>Broadcast Studio</strong></a>
      <nav><a href="/dashboard">Creator Dashboard</a><a href="/watch">Watch</a>
        <button type="button" className="svt-primary" onClick={() => window.open('/dashboard/broadcast/stage', 'squadview-broadcast-stage')}>Open Broadcast Stage ↗</button></nav>
    </header>
    <main className="svt-main">
      <div className="svt-heading"><div><div className="svt-eyebrow">BROADCAST PRODUCTION · BROWSER-LOCAL BETA</div><h1>Broadcast Studio</h1>
        <p>Signed in as @{hostLogin || 'Twitch creator'}. Changes update the stage in the same browser profile.</p></div><strong className="svt-counter">{model.roster.length} / 16 competitors</strong></div>
      <p className="svt-warning">Local integration preview: tournament settings are stored only in this browser, not in Supabase. No remote directing or public tournament links yet. OBS must capture a Chrome window in this same browser profile.</p>
      {(error || notice) && <div role={error ? 'alert' : 'status'} className={error ? 'svt-error' : 'svt-success'}>{error || notice}</div>}
      <section className="svt-panel svt-mode-chooser" aria-labelledby="svt-mode-title">
        <div className="svt-panel-head"><h2 id="svt-mode-title">Choose your studio mode</h2><span className="svt-pill">{model.studioMode === 'tournament' ? 'Tournament Mode' : 'Streamer Mode'}</span></div>
        <div className="svt-mode-buttons">
          <button type="button" aria-pressed={model.studioMode === 'streamer'} className={model.studioMode === 'streamer' ? 'svt-selected' : ''}
            onClick={() => setStudioMode('streamer')}><strong>Streamer Mode</strong><span>Feature other channels in your OBS output. No tournament setup needed.</span></button>
          <button type="button" aria-pressed={model.studioMode === 'tournament'} className={model.studioMode === 'tournament' ? 'svt-selected' : ''}
            onClick={() => setStudioMode('tournament')}><strong>Tournament Mode</strong><span>Game formats, teams and one-click team scenes.</span></button>
        </div>
        <p className="svt-help">Both modes use the same 16-streamer roster and Preview / Program switcher. Switching modes preserves your saved lineup and team assignments.</p>
      </section>
      <TournamentSwitcherPanel model={model} preview={previewScene} hostLogin={hostLogin}
        liveLogins={liveLogins} activeSlot={Math.min(activeSlot, LAYOUTS[previewScene.layout] - 1)}
        onSlot={setActiveSlot} onSelectPlayer={queuePlayer}
        onLayout={layout => { setPreviewDraft(current => switcherLayout(current || model, layout, model, hostLogin)); setError(''); }}
        onTeamPreview={cueTeam} onTeamTake={takeTeamNow} onTake={takePreview}
        onResetPreview={() => { setPreviewDraft(null); setActiveSlot(0); setNotice('Preview reset to current Program.'); }} />
      <div className="svt-columns"><div className="svt-stack">
        <section className="svt-panel"><div className="svt-panel-head"><h2>01 · {model.studioMode === 'tournament' ? 'Tournament setup' : 'Streamer setup'}</h2></div>
          <div className="svt-fields"><label>{model.studioMode === 'tournament' ? 'Tournament title' : 'Broadcast name'}<input maxLength={72} value={model.title} onChange={e => change({ title: e.target.value }, 'Tournament name updated.')} /></label>
            {model.studioMode === 'tournament' && <label>Game<input maxLength={40} placeholder="e.g. Apex Legends" value={model.game} onChange={e => change({ game: e.target.value })} /></label>}
            {model.studioMode === 'tournament' && <label>Team format<select value={model.format} onChange={e => change(current => ({ ...current, format: e.target.value,
              teamSize: e.target.value === 'custom' ? current.teamSize : FORMATS[e.target.value],
              layout: e.target.value === 'trios' ? 'trio' : current.layout }))}>
              {formats.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
            {model.studioMode === 'tournament' && model.format === 'custom' && <label>Players per team<select value={model.teamSize} onChange={e => change({ teamSize: Number(e.target.value) })}>
              {Array.from({ length: 15 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n} players</option>)}</select></label>}
          </div><p className="svt-help">{model.studioMode === 'streamer' ? 'Choose your roster below, build a Preview and press TAKE. Set up teams only if you switch to Tournament Mode.' : model.format === 'solo' ? 'Individual competition; no team assignments needed.' : `${model.teamSize} per team · up to ${Math.floor(16 / model.teamSize)} complete teams in the 16-person roster.`}</p>
        </section>
        {model.studioMode === 'tournament' && model.format !== 'solo' && <section className="svt-panel"><div className="svt-panel-head"><h2>02 · Teams</h2>
          <button type="button" disabled={model.teams.length >= 16} onClick={() => change(current => ({ ...current, teams: [...current.teams,
            { id: `team-${Date.now().toString(36)}`, name: `Team ${current.teams.length + 1}` }] }), 'Team added.')}>+ Add team</button></div>
          <div className="svt-stack-sm">{model.teams.map(team => {
            const assigned = model.roster.filter(p => p.teamId === team.id).length;
            return <div className="svt-team" key={team.id}><input aria-label={`Name of ${team.name}`} maxLength={40} value={team.name}
              onChange={e => change(current => ({ ...current, teams: current.teams.map(t => t.id === team.id ? { ...t, name: e.target.value } : t) }))} />
              <span>{assigned}/{model.teamSize}</span><button disabled={!teamSceneFor(model, team.id, hostLogin)} onClick={() => cueTeam(team.id)}>Preview team</button>
              <button aria-label={`Remove ${team.name}`} onClick={() => change(current => ({ ...current, teams: current.teams.filter(t => t.id !== team.id),
                roster: current.roster.map(p => p.teamId === team.id ? { ...p, teamId: '' } : p) }), 'Team removed; competitors unassigned.')}>×</button></div>;
          })}</div></section>}
        <section className="svt-panel"><div className="svt-panel-head"><h2>03 · {model.studioMode === 'tournament' ? 'Competitor roster' : 'Streamer roster'}</h2><span className="svt-pill">{model.roster.length} / 16</span></div>
          <div className="svt-input-row"><input aria-label="Twitch username" placeholder="Enter Twitch username" value={manual} onChange={e => setManual(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLogins(manual); } }} />
            <button className="svt-primary" disabled={model.roster.length >= 16} onClick={() => addLogins(manual)}>Add</button></div>
          <details className="svt-fold"><summary>Paste multiple usernames</summary><textarea rows={3} value={bulk} onChange={e => setBulk(e.target.value)} placeholder="one per line, or comma-separated" />
            <button onClick={() => addLogins(bulk)}>Import names</button></details>
          <div className="svt-picker-tabs">{[['following', 'Twitch Following'], ['favorites', `Favorites (${favorites.length})`]].map(([value, label]) =>
            <button key={value} aria-pressed={picker === value} className={picker === value ? 'svt-selected' : ''} onClick={() => setPicker(value)}>{label}</button>)}</div>
          <input aria-label="Search Twitch channels" placeholder="Search streamers you follow or favorite…" value={search} onChange={e => setSearch(e.target.value)} />
          {picker === 'following' && followingStatus === 'loading' && <p className="svt-help">Loading Twitch follows…</p>}
          {picker === 'following' && followingStatus === 'error' && <p className="svt-help">{followingError} You can still add manually.</p>}
          {picker === 'following' && followingStatus === 'ready' && !available.length && <p className="svt-help">No matching follows found.</p>}
          {picker === 'favorites' && !available.length && <p className="svt-help">No matching account Favorites found.</p>}
          <div className="svt-picklist">{available.map(item => <div className="svt-pick" key={item.login}><div>
            <strong>{item.label}</strong><small>@{item.login} · {liveLogins.has(item.login) ? '● Confirmed live' : liveStatus === 'ready' ? 'Live status unconfirmed' : 'Status unavailable'}</small>
            </div><button disabled={model.roster.length >= 16 || model.roster.some(p => p.login === item.login)} onClick={() => addLogins(item.login)}>
              {model.roster.some(p => p.login === item.login) ? 'Added' : 'Add'}</button></div>)}</div>
          <h3>Selected competitors</h3><div className="svt-stack-sm">{model.roster.map((person, i) => <div className="svt-person" key={person.login}>
            <span className="svt-number">{String(i + 1).padStart(2, '0')}</span><strong>@{person.login}</strong>
            {model.studioMode === 'tournament' && model.format !== 'solo' && <select aria-label={`Team for ${person.login}`} value={person.teamId} onChange={e => setAssignment(person.login, e.target.value)}>
              <option value="">Unassigned</option>{model.teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select>}
            <button onClick={() => queuePlayer(person.login)} disabled={person.login === hostLogin}>{previewScene?.featured.includes(person.login) ? 'In Preview' : 'Queue Preview'}</button>
            <button aria-label={`Remove ${person.login}`} onClick={() => change(current => ({ ...current,
              roster: current.roster.filter(p => p.login !== person.login),
              featured: current.featured.filter(login => login !== person.login),
              presets: current.presets.map(p => ({ ...p, featured: p.featured.filter(login => login !== person.login) }))
            }), `Removed @${person.login}.`)}>×</button></div>)}</div>
          {!model.roster.length && <p className="svt-empty">Add your first competitor to populate the Broadcast Stage automatically.</p>}
          {model.roster.length > 0 && <p className="svt-help">Streamers remain in your roster when offline. Following live status is not a definitive offline check.</p>}
        </section>
      </div><div className="svt-stack">
        <section className="svt-panel"><div className="svt-panel-head"><h2>05 · Scene presets & broadcast settings</h2><span className="svt-pill">Program: {chosen.length} on air</span></div>
          <p className="svt-help">Save the current Preview as a preset, or queue an existing preset. Only TAKE changes the OBS stage; Take Now is an explicit fast switch.</p>
          <div className="svt-input-row"><input value={presetName} maxLength={35} onChange={e => setPresetName(e.target.value)} placeholder="Final Round, Caster View…" aria-label="Preset name" />
            <button disabled={!presetName.trim() || !previewScene.featured.length || model.presets.length >= MAX_PRESETS} onClick={() => { change(current => ({ ...current, presets: [...current.presets,
              { name: presetName.trim(), layout: previewScene.layout, featured: previewScene.featured }] }), 'Preview saved as scene preset.'); setPresetName(''); }}>Save Preview</button></div>
          <div className="svt-presets">{model.presets.map((preset, i) => <div className="svt-preset" key={`${preset.name}-${i}`}>
            <strong>{preset.name}</strong>
            <button type="button" onClick={() => { setPreviewDraft(switcherScene(preset, model, hostLogin)); setActiveSlot(0); setNotice(`Preset ${preset.name} queued in Preview.`); }}>Preview</button>
            <button type="button" onClick={() => change(current => ({ ...current, layout: preset.layout,
              featured: preset.featured, audioOwner: '' }), `ON AIR: ${preset.name}.`)}>Take Now</button>
            <button aria-label={`Delete preset ${preset.name}`} onClick={() => change(current => ({ ...current,
              presets: current.presets.filter((_, idx) => idx !== i) }), 'Preset removed.')}>×</button></div>)}</div>
          <h3>Broadcast audio</h3><label>Audible player (Program only)<select value={model.audioOwner} onChange={e => change({ audioOwner: e.target.value })}>
            <option value="">Mute all streams</option>{chosen.map(login => <option key={login} value={login}>@{login}</option>)}</select></label>
          <p className="svt-help">Audio choice applies to the live Program stage, not Preview. Scene takes mute all streams until audio is selected. On the Stage, click Enable stage audio once.</p>
          <label className="svt-checkbox"><input type="checkbox" checked={model.embedsEnabled} onChange={e => change({ embedsEnabled: e.target.checked })} /> Load Twitch embeds into Broadcast Stage</label>
          <p className="svt-help">Enable only for streams you have permission to rebroadcast. Without this, you can preview layouts with placeholders.</p>
          <div className="svt-actions"><button className="svt-primary" onClick={() => window.open('/dashboard/broadcast/stage', 'squadview-broadcast-stage')}>Open Broadcast Stage ↗</button>
            <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/dashboard/broadcast/stage`)
              .then(() => setNotice('Stage URL copied. Works in the same signed-in browser profile only.')).catch(() => setError('Could not copy stage URL.')); }}>Copy stage URL</button></div>
        </section>
        <details className="svt-panel svt-chat"><summary>💬 Your Twitch chat (optional)</summary>
          {hostLogin ? <iframe title={`Chat for ${hostLogin}`} loading="lazy"
            src={`https://www.twitch.tv/embed/${encodeURIComponent(hostLogin)}/chat?parent=${encodeURIComponent(window.location.hostname)}&darkpopout`} />
            : <p>Twitch username was not available from your account profile.</p>}
          <p className="svt-help">Your chat appears only in the director console. Twitch may request a separate embedded-chat login.</p></details>
        <section className="svt-panel"><h2>Local beta controls</h2><p className="svt-help">This beta saves your setup in this browser. No cloud tournament storage or remote OBS Browser Source support yet. Your Creator Squads and personal Saved Squads are unchanged.</p>
          <button onClick={() => { if (window.confirm('Reset this account’s local Broadcast Studio setup?'))
            change(initialTournament(hostLogin, model.studioMode), 'Local studio setup reset.'); }}>Reset local studio</button>
        </section>
      </div></div>
    </main>
  </div>;
}
