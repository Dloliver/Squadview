import { useState } from 'react';
import { LAYOUTS, switcherSameScene, teamSceneFor } from '../services/tournamentLocalService';
const labels = { spotlight: 'SPOTLIGHT', versus: 'VERSUS', trio: 'TRIOS', quad: 'FOUR STREAMS' };
function SceneMonitor({ title, scene, roster, teams, studioMode, isProgram = false, activeSlot, onSlot }) {
  const channels = Array.from({ length: LAYOUTS[scene.layout] }, (_, i) => scene.featured[i] || '');
  return <div className={`svt-switcher-monitor ${isProgram ? 'svt-program' : 'svt-preview'}`}>
    <div className="svt-switcher-monitor-header"><strong>{title}</strong><span>{labels[scene.layout]}</span></div>
    <div className="svt-switcher-monitor-grid" data-count={LAYOUTS[scene.layout]}>
      {channels.map((login, i) => {
        const person = roster.find(p => p.login === login);
        const team = teams.find(t => t.id === person?.teamId);
        return isProgram
          ? <div className="svt-switcher-tile" key={`p-${i}`}><small>{i + 1}</small><strong>{login ? `@${login}` : 'Empty'}</strong><span>{studioMode === 'tournament' ? team?.name || 'Competitor' : 'Streamer'}</span></div>
          : <button type="button" key={`v-${i}`} className={`svt-switcher-tile${i === activeSlot ? ' svt-slot-active' : ''}`}
              aria-pressed={i === activeSlot} title={`Assign a competitor to preview slot ${i + 1}`}
              onClick={() => onSlot(i)}><small>INPUT {i + 1}</small><strong>{login ? `@${login}` : '+ Choose player'}</strong><span>{team?.name || 'Preview slot'}</span></button>;
      })}
    </div>
    <div className="svt-switcher-monitor-foot">{isProgram ? 'What OBS is showing' : 'Private scene plan — not on air'}</div>
  </div>;
}
export default function TournamentSwitcherPanel({ model, preview, hostLogin, activeSlot,
  liveLogins, onSlot, onSelectPlayer, onLayout, onTeamPreview, onTeamTake,
  onTake, onResetPreview }) {
  const [showLiveSource, setShowLiveSource] = useState(false);
  const program = { layout: model.layout, featured: model.featured.slice(0, LAYOUTS[model.layout]) };
  const same = switcherSameScene(preview, program, model, hostLogin);
  const currentPreviewPlayer = preview.featured[activeSlot] || '';
  const eligible = model.roster.filter(p => p.login !== hostLogin);
  return <section className="svt-panel svt-switcher" aria-labelledby="svt-switcher-heading">
    <div className="svt-panel-head"><div><h2 id="svt-switcher-heading">Live Production Switcher</h2>
      <p className="svt-help">Select the next scene in Preview, then press TAKE to change what OBS captures.</p></div><span className="svt-pill">{eligible.length} inputs</span></div>
    <div className="svt-switcher-monitors">
      <SceneMonitor title="● PROGRAM — ON AIR" scene={program} roster={model.roster} teams={model.teams} studioMode={model.studioMode} isProgram />
      <SceneMonitor title="● PREVIEW — NEXT" scene={preview} roster={model.roster} teams={model.teams} studioMode={model.studioMode} activeSlot={activeSlot} onSlot={onSlot} />
    </div>
    <div className="svt-switcher-takebar"><span>{same ? 'Preview matches Program' : 'New scene ready to take'}</span>
      <button type="button" disabled={same || !preview.featured.length} className="svt-switcher-take" onClick={onTake}>TAKE → PROGRAM</button>
      <button type="button" onClick={onResetPreview}>Reset Preview</button></div>
    <div className="svt-switcher-layouts"><strong>Preview layout</strong>
      <div className="svt-layouts">{[['spotlight','1','Spotlight'],['versus','2','Versus'],['trio','3','Trio'],['quad','4','Four']].map(([layout,n,label]) =>
        <button key={layout} type="button" aria-pressed={preview.layout === layout} className={preview.layout === layout ? 'svt-selected' : ''}
          onClick={() => { onLayout(layout); onSlot(Math.min(activeSlot, LAYOUTS[layout] - 1)); }}><strong>{n}</strong><span>{label}</span></button>)}</div>
    </div>
    <div className="svt-switcher-source-head"><strong>{model.studioMode === 'tournament' ? 'Competitor inputs' : 'Streamer inputs'}</strong><span>Click a Preview tile to choose a slot, then select a channel</span></div>
    <div className="svt-switcher-inputs">
      {eligible.map((player, i) => {
        const team = model.teams.find(t => t.id === player.teamId);
        const inPreview = preview.featured.includes(player.login);
        const onAir = program.featured.includes(player.login);
        return <button type="button" key={player.login} className={inPreview ? 'svt-selected' : ''}
          onClick={() => onSelectPlayer(player.login)} aria-label={`Queue ${player.login} in preview slot ${activeSlot + 1}`}>
          <span className="svt-switcher-input-number">{String(i + 1).padStart(2, '0')}</span>
          <strong>@{player.login}</strong><small>{model.studioMode === 'tournament' ? team?.name || 'Unassigned' : 'Streamer'}{liveLogins.has(player.login) ? ' · Live' : ''}</small>
          <span className="svt-switcher-input-indicators">{onAir && <em className="svt-on-air">ON AIR</em>}{inPreview && <em className="svt-on-preview">PREVIEW</em>}</span>
        </button>;
      })}
      {!eligible.length && <p className="svt-help">Add Twitch streamers to populate your switcher inputs.</p>}
    </div>
    {model.studioMode === 'tournament' && model.format !== 'solo' && <div className="svt-switcher-teams"><h3>Team scene shortcuts</h3>
      <p className="svt-help">Preview lets you inspect the lineup before switching. Take Now sends a saved team directly to Program.</p>
      <div className="svt-switcher-team-grid">{model.teams.map(team => {
        const scene = teamSceneFor(model, team.id, hostLogin);
        return <div key={team.id} className="svt-switcher-team"><strong>{team.name}</strong><small>{scene ? `${scene.memberCount} assigned · ${scene.featured.length} on stage` : 'No eligible team members'}</small>
          <div><button type="button" disabled={!scene} onClick={() => onTeamPreview(team.id)}>Preview</button>
          <button type="button" disabled={!scene} onClick={() => onTeamTake(team.id)}>Take Now</button></div></div>;
      })}</div>
    </div>}
    <details className="svt-switcher-live-source" open={showLiveSource} onToggle={e => setShowLiveSource(e.currentTarget.open)}>
      <summary>Optional: inspect live video for selected preview player (muted)</summary>
      <p className="svt-help">Loads only one additional Twitch embed. The scene diagram above previews the full composition; this monitor checks the selected player's live feed. It will not be broadcast.</p>
      {showLiveSource && currentPreviewPlayer ? <div className="svt-switcher-live-player">
        <iframe key={currentPreviewPlayer} title={`Muted live preview of ${currentPreviewPlayer}`}
          src={`https://player.twitch.tv/?channel=${encodeURIComponent(currentPreviewPlayer)}&parent=${encodeURIComponent(window.location.hostname)}&muted=true&autoplay=false`}
          allow="autoplay; fullscreen" width="100%" height="310" />
      </div> : <p className="svt-help">Select a competitor in Preview to inspect their video.</p>}
    </details>
  </section>;
}
