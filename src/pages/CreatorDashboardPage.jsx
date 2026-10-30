import { useEffect, useState } from 'react';
import {
  getCurrentAccountSession, isSquadViewAuthConfigured, loadSquadViewUserState, signInWithTwitch,
  signOutOfSquadView, subscribeToAccountChanges,
} from '../services/accountService';
import { loadCreatorSquads, loadCreatorDraft, saveCreatorDraft, publishCreatorSquad, unpublishCreatorSquad } from '../services/creatorStudioService';
import { loadFollowedChannels, loadFollowedLiveStreams } from '../services/twitchFollowingService';
import { loadSquadViewEntitlements } from '../services/premiumService';
import './creatorDashboard.css';

const CHANNEL_REGEX = /^[a-z0-9_]{1,25}$/;
const SLUG_REGEX = /^[a-z0-9][a-z0-9_-]{2,39}$/;
const blank = () => ({ id: crypto.randomUUID(), slug: '', title: '', description: '', channels: [] });
function normalizeFollowing(result) {
  const source = Array.isArray(result) ? result :
    (result?.channels || result?.followedChannels || result?.followed_channels || result?.data || []);
  if (!Array.isArray(source)) return [];
  const unique = new Map();
  for (const item of source) {
    const details = typeof item === 'string' ? { login: item } : (item || {});
    const login = String(details.login || details.broadcaster_login || details.user_login ||
      details.twitch_login || details.username || details.channel || details.name || '').trim().toLowerCase();
    if (!CHANNEL_REGEX.test(login) || unique.has(login)) continue;
    unique.set(login, {
      login,
      label: String(details.display_name || details.broadcaster_name || details.displayName || login),
      avatar: String(details.profile_image_url || details.profileImageUrl || details.avatar_url || details.avatar || ''),
      live: details.is_live === true || details.isLive === true,
    });
  }
  return [...unique.values()].sort((a,b) => a.label.localeCompare(b.label));
}
// Live data is independent of Following; absence from a response is NOT proof of offline.
function extractLiveLogins(result) {
  const source = Array.isArray(result) ? result :
    (result?.channels || result?.streams || result?.liveStreams || result?.live_streams || result?.data || []);
  if (!Array.isArray(source)) return new Set();
  const found = new Set();
  for (const item of source) {
    const obj = typeof item === 'string' ? { login: item } : (item || {});
    const login = String(obj.login || obj.broadcaster_login || obj.user_login ||
      obj.twitch_login || obj.channel || obj.username || obj.name || '').trim().toLowerCase();
    if (CHANNEL_REGEX.test(login)) found.add(login);
  }
  return found;
}
function LiveLabel({ channel, liveLogins, status }) {
  if (status !== 'ready') return <span className="creator-dashboard__live-unknown">Status unavailable</span>;
  if (liveLogins.has(channel)) return <span className="creator-dashboard__live-on">● Live now</span>;
  // A followed-live feed may be partial; do not mislabel its omissions as offline.
  return <span className="creator-dashboard__live-unknown">Not shown live · status unconfirmed</span>;
}
function ownTwitchLogin(user) {
  const data = user?.identities?.find((entry) => entry?.provider === 'twitch')?.identity_data || {};
  const m = user?.user_metadata || {};
  const login = String(data.preferred_username || data.user_name || data.login ||
    m.preferred_username || m.user_name || m.login || '').trim().toLowerCase();
  return CHANNEL_REGEX.test(login) ? login : '';
}
function identity(user) {
  const m = user?.user_metadata || {};
  return m.display_name || m.name || m.preferred_username || m.user_name || 'Twitch creator';
}

export default function CreatorDashboardPage() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [squads, setSquads] = useState([]);
  const [listState, setListState] = useState('idle');
  const [draft, setDraft] = useState(null);
  const [original, setOriginal] = useState('');
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState(null);
  const [newChannel, setNewChannel] = useState('');
  const [picker, setPicker] = useState('favorites');
  const [favorites, setFavorites] = useState([]);
  const [liveOnly, setLiveOnly] = useState(false);
  const [following, setFollowing] = useState([]);
  const [followingStatus, setFollowingStatus] = useState('idle');
  const [followingError, setFollowingError] = useState('');
  const [followingSearch, setFollowingSearch] = useState('');
  const [liveLogins, setLiveLogins] = useState(() => new Set());
  const [liveStatus, setLiveStatus] = useState('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [creatorPremium, setCreatorPremium] = useState(false);
  const [limitModal, setLimitModal] = useState(false);
  const [entitlementLoading, setEntitlementLoading] = useState(true);
  const userId = session?.user?.id || null;
  const rosterLimit = creatorPremium ? 50 : 16;
  const squadLimit = creatorPremium ? 10 : 1;
  const activeSquad = squads.find((item) => item.is_published);
  const atLimit = Boolean(draft && draft.channels.length >= rosterLimit);

  useEffect(() => {
    let active = true;
    getCurrentAccountSession()
      .then((s) => { if (active) { setSession(s); setReady(true); } })
      .catch((e) => { if (active) { setError(e?.message || 'Could not load account.'); setReady(true); } });
    const unsubscribe = subscribeToAccountChanges((s) => {
      if (!active) return;
      setSession(s); setReady(true); setError('');
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    setEntitlementLoading(true);
    setCreatorPremium(false);
    if (!userId) { setEntitlementLoading(false); return () => { active = false; }; }
    loadSquadViewEntitlements(userId).then((access) => {
      if (active) { setCreatorPremium(Boolean(access.isPremium)); setEntitlementLoading(false); }
    }).catch(() => { if (active) { setCreatorPremium(false); setEntitlementLoading(false); } });
    return () => { active = false; };
  }, [userId]);
  function warnLimit() { setLimitModal(true); }
  async function refresh(ownerId) {
    setListState('loading');
    try { setSquads(await loadCreatorSquads(ownerId)); setListState('ready'); }
    catch (e) { setError(e?.message || 'Could not load Creator Squads.'); setListState('error'); }
  }
  useEffect(() => {
    if (!userId) { setSquads([]); setDraft(null); setListState('idle'); return; }
    let active = true;
    setListState('loading');
    loadCreatorSquads(userId).then((items) => { if (active) { setSquads(items); setListState('ready'); } })
      .catch((e) => { if (active) { setError(e?.message || 'Could not load Creator Squads.'); setListState('error'); } });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId) { setFavorites([]); return; }
    let active = true;
    // Use the creator's account-linked Favorites; do not copy a guest roster.
    loadSquadViewUserState(userId).then((state) => {
      if (!active) return;
      const raw = state?.favorite_streamers || state?.favoriteStreamers || [];
      setFavorites([...new Set((Array.isArray(raw) ? raw : []).map(v => String(v || '').toLowerCase()).filter(v => CHANNEL_REGEX.test(v)))]);
    }).catch(() => { if (active) setFavorites([]); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setFollowing([]); setFollowingStatus('idle'); setFollowingError('');
      return;
    }
    let active = true;
    setFollowingStatus('loading'); setFollowingError('');
    // Use SquadView's existing Twitch following integration; no new OAuth scopes.
    loadFollowedChannels(userId).then((result) => {
      if (!active) return;
      setFollowing(normalizeFollowing(result)); setFollowingStatus('ready');
    }).catch((e) => {
      if (!active) return;
      setFollowingStatus('error');
      setFollowingError(e?.message || 'Could not load followed channels.');
    });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId) { setLiveLogins(new Set()); setLiveStatus('idle'); return; }
    let active = true;
    setLiveStatus('loading');
    loadFollowedLiveStreams(userId).then((result) => {
      if (!active) return;
      setLiveLogins(extractLiveLogins(result)); setLiveStatus('ready');
    }).catch(() => { if (active) setLiveStatus('unavailable'); });
    return () => { active = false; };
  }, [userId]);
  async function refreshLive() {
    if (!userId || liveStatus === 'loading') return;
    setLiveStatus('loading');
    try { setLiveLogins(extractLiveLogins(await loadFollowedLiveStreams(userId))); setLiveStatus('ready'); }
    catch { setLiveStatus('unavailable'); }
  }
  async function signIn() {
    setAuthBusy(true); setError('');
    try { await signInWithTwitch(); }
    catch (e) { setError(e?.message || 'Twitch sign-in could not start.'); setAuthBusy(false); }
  }
  async function signOut() {
    setAuthBusy(true); setError('');
    try { await signOutOfSquadView(); }
    catch (e) { setError(e?.message || 'Could not sign out.'); }
    finally { setAuthBusy(false); }
  }
  const dirty = draft && JSON.stringify(draft) !== original;
  async function openDraft(squad) {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setError(''); setNotice(''); setLoadingDraft(true);
    try {
      const channels = await loadCreatorDraft(squad.id);
      const next = { id: squad.id, slug: squad.slug, title: squad.title, description: squad.description, channels };
      setDraft(next); setOriginal(JSON.stringify(next));
    } catch (e) { setError(e?.message || 'Could not open Squad draft.'); }
    finally { setLoadingDraft(false); }
  }
  function createDraft() {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    const next = blank(); setDraft(next); setOriginal(''); setError(''); setNotice('');
  }
  function update(field, value) { setDraft((prev) => ({ ...prev, [field]: value })); setNotice(''); }
  function addChosenChannel(login) {
    if (!draft) return;
    const value = String(login || '').trim().toLowerCase().replace(/^@/, '');
    if (!CHANNEL_REGEX.test(value)) { setError('Use a valid Twitch login (letters, digits or underscores).'); return; }
    if (draft.channels.includes(value)) return;
    if (draft.channels.length >= rosterLimit) { warnLimit(); return; }
    update('channels', [...draft.channels, value]); setError('');
  }
  function addChannel() {
    const value = newChannel.trim().toLowerCase().replace(/^@/, '');
    if (!CHANNEL_REGEX.test(value)) { setError('Use a valid Twitch login (letters, digits or underscores).'); return; }
    if (draft.channels.includes(value)) { setError('That streamer is already featured.'); return; }
    if (draft.channels.length >= rosterLimit) { warnLimit(); return; }
    update('channels', [...draft.channels, value]); setNewChannel(''); setError('');
  }
  function move(index, offset) {
    const next = [...draft.channels]; const other = index + offset;
    if (other < 0 || other >= next.length) return;
    [next[index], next[other]] = [next[other], next[index]];
    update('channels', next);
  }
  async function save() {
    if (!userId || !draft || saving) return;
    const next = { ...draft, slug: draft.slug.trim().toLowerCase(), title: draft.title.trim(), description: draft.description.trim() };
    if (!SLUG_REGEX.test(next.slug)) { setError('Slug must be 3–40 lowercase letters, numbers, - or _.'); return; }
    if (!next.title || next.title.length > 80 || next.description.length > 500) { setError('Title must be 1–80 characters; description up to 500.'); return; }
    if (next.channels.length > rosterLimit) { warnLimit(); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      await saveCreatorDraft(next);
      // A successful RPC save is authoritative; a separate list refresh may fail.
      // Preserve edits made while the save request was in flight.
      setDraft((current) => JSON.stringify(current) === JSON.stringify(draft) ? next : current);
      setOriginal(JSON.stringify(next));
      setNotice('Private draft saved. Your published lineup, if any, is unchanged.');
      // Refresh the sidebar independently; do not report a saved draft as failed.
      await refresh(userId);
    } catch (e) { setError(e?.message || 'Could not save draft.'); }
    finally { setSaving(false); }
  }
  async function changePublication(squad, shouldPublish) {
    if (!userId || publishingId || saving || loadingDraft || entitlementLoading) return;
    if (dirty) {
      setError('Save or discard your unsaved draft changes before changing the active Squad.');
      return;
    }
    if (shouldPublish && activeSquad && activeSquad.id !== squad.id &&
        !window.confirm(`Make ${squad.title} active? This will deactivate ${activeSquad.title}.`)) return;
    setPublishingId(squad.id); setError(''); setNotice('');
    try {
      if (shouldPublish) await publishCreatorSquad(squad.id);
      else await unpublishCreatorSquad(squad.id);
      // The secured RPC commits atomically; reflect the new active state immediately.
      setSquads((current) => current.map((item) => ({
        ...item,
        is_published: item.id === squad.id ? shouldPublish : (shouldPublish ? false : item.is_published),
      })));
      setNotice(shouldPublish ? `${squad.title} is now your active Squad.` : `${squad.title} is now inactive.`);
      // Recheck server state, but don't misreport a successful publish as a failure.
      await refresh(userId);
    } catch (e) { setError(e?.message || 'Could not change the active Squad.'); }
    finally { setPublishingId(null); }
  }
  function copySquadLink(squad) {
    // Available after public Edge Function deployment and frontend release.
    const url = `${window.location.origin}/s/${encodeURIComponent(squad.slug)}`;
    navigator.clipboard.writeText(url).then(() => {
      setNotice('Squad URL copied. Public viewing requires the Creator live endpoint to be deployed.');
    }).catch(() => setError('Could not copy. Please copy the displayed address manually.'));
  }
  return (
    <div className="creator-dashboard">
      <header className="creator-dashboard__topbar">
        <a className="creator-dashboard__brand" href="/watch">◉ SquadView</a>
        <nav aria-label="Creator Studio navigation"><a href="/watch">Watch streams</a><a href="/dashboard/broadcast">Broadcast Studio</a><a href="/learn">About SquadView</a></nav>
      </header>
      <main className="creator-dashboard__main">
        <div className="creator-dashboard__eyebrow">CREATOR STUDIO · SQUAD MANAGEMENT</div>
        <h1>Your Squad Dashboard</h1>
        <p className="creator-dashboard__intro">Build the lineups your community can watch together. Creator Squads are separate from personal Favorites and Saved Squads.</p>
        {error && <div role="alert" className="creator-dashboard__error">{error}</div>}
        {limitModal && <div className="creator-dashboard__limit-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setLimitModal(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="creator-roster-limit-title" className="creator-dashboard__limit-modal">
            <h2 id="creator-roster-limit-title">Your Creator Squad roster is full</h2>
            <p>You have reached your {rosterLimit}-streamer {creatorPremium ? 'Premium' : 'Free'} roster limit. Remove a streamer to make room{creatorPremium ? '.' : ', or explore SquadView Premium to unlock up to 50.'}</p>
            <div className="creator-dashboard__row">
              <button type="button" onClick={() => setLimitModal(false)}>Manage my roster</button>
              {!creatorPremium && <a href="/watch" className="creator-dashboard__premium-link">Explore Premium in SquadView</a>}
            </div>
          </section>
        </div>}

        {!isSquadViewAuthConfigured ? (
          <section className="creator-dashboard__panel"><h2>Sign-in unavailable</h2><p>SquadView account connection is not configured.</p></section>
        ) : !ready ? (
          <section className="creator-dashboard__panel" role="status">Checking your Twitch session…</section>
        ) : !userId ? (
          <section className="creator-dashboard__panel"><h2>Connect your Twitch account</h2><p>Your current SquadView login works here.</p><button onClick={signIn} disabled={authBusy}>{authBusy ? 'Connecting…' : 'Continue with Twitch'}</button></section>
        ) : (
          <>
            <section className="creator-dashboard__panel creator-dashboard__account">
              <div><span className="creator-dashboard__muted">Signed in as</span><h2>{identity(session.user)}</h2><p>Creator Studio uses your current SquadView account.</p></div>
              <button className="creator-dashboard__secondary" onClick={signOut} disabled={authBusy}>{authBusy ? 'Working…' : 'Sign out'}</button>
            </section>
            <section className="creator-dashboard__panel" aria-labelledby="creator-tournament-heading">
              <div className="creator-dashboard__section-head"><h2 id="creator-tournament-heading">Broadcast Studio</h2>
                <a className="creator-dashboard__premium-link" href="/dashboard/broadcast">Open Broadcast Studio</a></div>
              <p>Select up to 16 streamers and switch between their feeds using an OBS-ready Preview/Program console. Turn on Tournament Mode for teams and game formats.</p>
              <p className="creator-dashboard__hint">Local pilot only: saved in this browser, not published to your public creator link. Available to signed-in SquadView organizers.</p>
            </section>
            <section className="creator-dashboard__panel" aria-labelledby="creator-squads-heading">
              <div className="creator-dashboard__section-head"><h2 id="creator-squads-heading">Your Creator Squads ({squads.length}/{entitlementLoading ? '…' : squadLimit})</h2><button onClick={createDraft} disabled={saving || loadingDraft || Boolean(publishingId) || entitlementLoading || listState !== 'ready' || squads.length >= squadLimit}>+ New Creator Squad</button></div>
              {squads.length >= squadLimit && !entitlementLoading && <p className="creator-dashboard__hint">Your {creatorPremium ? 'Premium' : 'Free'} saved-Squad allowance is full. {creatorPremium ? 'You can edit or activate existing Squads.' : 'Premium unlocks up to 10 saved Creator Squads.'}</p>}
              <p className="creator-dashboard__hint">Only one Squad can be active. Make Active publishes its saved roster and automatically deactivates your previous Squad. Public viewing links and the chatbot are coming in a later phase.</p>
              {listState === 'loading' && <p role="status">Loading your Creator Squads…</p>}
              {listState === 'ready' && squads.length === 0 && <p>No Creator Squads yet. Create a private draft to get started.</p>}
              {squads.length > 0 && (
                <ul className="creator-dashboard__list">{squads.map((s) => (
                  <li key={s.id} className={s.is_published ? 'creator-dashboard__squad-active' : ''}>
                    <div className="creator-dashboard__squad-meta"><strong>{s.title}</strong><span className="creator-dashboard__muted"> /s/{s.slug}</span><div><span className="creator-dashboard__status">{s.is_published ? '● Active Squad' : 'Inactive · saved privately'}</span></div></div>
                    <div className="creator-dashboard__squad-actions">
                      <button type="button" className="creator-dashboard__secondary" disabled={loadingDraft || saving || Boolean(publishingId)} onClick={() => openDraft(s)}>Edit draft</button>
                      <button type="button" disabled={loadingDraft || saving || entitlementLoading || Boolean(publishingId)} onClick={() => changePublication(s, !s.is_published)}>{publishingId === s.id ? 'Working…' : s.is_published ? 'Deactivate' : 'Make Active'}</button>
                      {s.is_published && <button type="button" className="creator-dashboard__secondary" disabled={loadingDraft || saving || Boolean(publishingId)} onClick={() => changePublication(s, true)}>Publish Updates</button>}
                      {s.is_published && <button type="button" className="creator-dashboard__secondary" onClick={() => copySquadLink(s)}>Copy Squad link</button>}
                    </div>
                  </li>
                ))}</ul>
              )}
            </section>
            {notice && !draft && <p className="creator-dashboard__save-status" role="status">{notice}</p>}
            {loadingDraft && <p role="status">Opening draft…</p>}
            {draft && (
              <section className="creator-dashboard__panel creator-dashboard__editor" aria-labelledby="creator-editor-title">
                <h2 id="creator-editor-title">{squads.some((s) => s.id === draft.id) ? 'Edit your private draft' : 'Create a private Squad'}</h2>
                <label htmlFor="creator-title">Squad title</label><input id="creator-title" maxLength={80} value={draft.title} onChange={(e) => update('title', e.target.value)} />
                <label htmlFor="creator-slug">Public URL slug</label><input id="creator-slug" maxLength={40} value={draft.slug} disabled={squads.some((s) => s.id === draft.id)} onChange={(e) => update('slug', e.target.value.toLowerCase())} placeholder="my-creator-squad" />
                <p className="creator-dashboard__hint">The URL slug cannot be changed after you create the Squad. The reserved link will become available when the public visitor route launches.</p>
                <details className="creator-dashboard__customize">
                  <summary>Customize Squad <span className="creator-dashboard__muted">(optional)</span></summary>
                  <label htmlFor="creator-description">Description (optional)</label>
                  <textarea id="creator-description" maxLength={500} rows={3} value={draft.description} onChange={(e) => update('description', e.target.value)} placeholder="Tell your viewers about this lineup, or leave it blank." />
                </details>
                <div className="creator-dashboard__streamer-header"><h3>Approved Twitch streamers ({draft.channels.length}/{entitlementLoading ? "…" : rosterLimit})</h3>
                  {ownTwitchLogin(session.user) && <button type="button" className="creator-dashboard__secondary" disabled={draft.channels.includes(ownTwitchLogin(session.user)) || entitlementLoading} onClick={() => addChosenChannel(ownTwitchLogin(session.user))}>{draft.channels.includes(ownTwitchLogin(session.user)) ? '✓ Your channel added' : '+ Add my channel'}</button>}
                </div>
                <p className="creator-dashboard__hint">{creatorPremium ? "Premium creator roster · up to 50 eligible channels" : "Free creator roster · up to 16 eligible channels"}. Only channels you explicitly add are eligible. If you select 1–4 channels, those exact channels open when live. With 5 or more, SquadView will randomly choose up to four live channels per visit; your own channel gets priority only if you added it and it is live.</p>
                <div className="creator-dashboard__picker-tabs" role="group" aria-label="Choose how to add Twitch streamers">
                  <button type="button" className={picker === 'favorites' ? 'creator-dashboard__picker-active' : 'creator-dashboard__secondary'} aria-pressed={picker === 'favorites'} onClick={() => setPicker('favorites')}>Favorites ({favorites.length})</button>
                  <button type="button" className={picker === 'following' ? 'creator-dashboard__picker-active' : 'creator-dashboard__secondary'} aria-pressed={picker === 'following'} onClick={() => setPicker('following')}>Following</button>
                  <button type="button" className={picker === 'manual' ? 'creator-dashboard__picker-active' : 'creator-dashboard__secondary'} aria-pressed={picker === 'manual'} onClick={() => setPicker('manual')}>Add manually</button>
                </div>
                {picker !== 'manual' ? (
                  <div className="creator-dashboard__picker-panel">
                    <label htmlFor="creator-following-search">Search Twitch channels</label>
                    <input id="creator-following-search" value={followingSearch} onChange={(e) => setFollowingSearch(e.target.value)} placeholder="Search favorites or followed streamers…" />
                    <label className="creator-dashboard__filter"><input type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} /> Live only (confirmed)</label>
                    {picker === 'favorites' && favorites.length === 0 && <p>No saved account Favorites found yet. You can use Following or Add manually.</p>}
                    {picker === 'following' && followingStatus === 'loading' && <p role="status">Loading Twitch follows…</p>}
                    {picker === 'following' && followingStatus === 'error' && <p role="alert">{followingError} You can still add channels manually.</p>}
                    {picker === 'following' && followingStatus === 'ready' && following.length === 0 && <p>No followed channels were returned. Use Add manually to enter a Twitch username.</p>}
                    {(picker === 'favorites' ? favorites.length > 0 : followingStatus === 'ready' && following.length > 0) && (
                      <ul className="creator-dashboard__following-list" aria-label="Followed Twitch channels">
                        {(picker === 'favorites' ? favorites.map((login) => following.find((item) => item.login === login) || { login, label: login, avatar: '' }) : following)
                          .filter((item) => `${item.login} ${item.label}`.toLowerCase().includes(followingSearch.trim().toLowerCase()))
                          .filter((item) => !liveOnly || (liveStatus === 'ready' && liveLogins.has(item.login)))
                          .sort((a, b) => Number(liveLogins.has(b.login)) - Number(liveLogins.has(a.login)) || a.label.localeCompare(b.label))
                          .slice(0, 100).map((item) => (
                          <li key={item.login}>
                            <div className="creator-dashboard__followed-identity">
                              {item.avatar ? <img src={item.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="creator-dashboard__avatar-placeholder" aria-hidden="true">◉</span>}
                              <span><strong>{item.label}</strong><small>@{item.login} · <LiveLabel channel={item.login} liveLogins={liveLogins} status={liveStatus}/></small></span>
                            </div>
                            <button type="button" className="creator-dashboard__secondary" disabled={draft.channels.includes(item.login) || entitlementLoading} onClick={() => addChosenChannel(item.login)}>{draft.channels.includes(item.login) ? 'Added' : 'Add'}</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {picker === 'following' && followingStatus === 'ready' && following.length > 100 && <p className="creator-dashboard__hint">Showing up to 100 matches. Search to narrow the list.</p>}
                  </div>
                ) : (
                  <div className="creator-dashboard__picker-panel">
                    <label htmlFor="creator-manual-channel">Twitch username</label>
                    <div className="creator-dashboard__row"><input id="creator-manual-channel" value={newChannel} onChange={(e) => setNewChannel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChannel(); } }} placeholder="Twitch username" /><button type="button" onClick={addChannel} disabled={entitlementLoading}>Add streamer</button></div>
                    <p className="creator-dashboard__hint">You can add a streamer even if you don't follow them.</p>
                  </div>
                )}
                <div className="creator-dashboard__live-head">
                  <h3>Live status</h3>
                  <button type="button" className="creator-dashboard__secondary" disabled={liveStatus === 'loading'} onClick={refreshLive}>{liveStatus === 'loading' ? 'Checking…' : 'Refresh live status'}</button>
                </div>
                <p className="creator-dashboard__hint">Live indicators come from your Twitch Following Live feed. Other channels may show an unconfirmed status. Last broadcast times are not provided by this feed; we will only display them when a verified source is available. This does not change your draft.</p>
                <h3>Your selected lineup</h3>
                <p className="creator-dashboard__hint">This is your approved roster, not the number of streams that play at once. You can reorder or remove channels here; visitors will start with no more than four currently live channels when public links are enabled.</p>
                <div className="creator-dashboard__live-preview">
                  <strong>Currently identified live ({draft.channels.filter(c => liveLogins.has(c)).length})</strong>
                  <span>{liveStatus === 'ready' ? (draft.channels.filter(c => liveLogins.has(c)).map(c => '@' + c).join(' · ') || 'No selected channels confirmed live') : 'Live lookup unavailable'}</span>
                </div>

                <ol className="creator-dashboard__roster">{draft.channels.map((c, i) => (
                  <li key={c}><div className="creator-dashboard__roster-identity"><strong>{i + 1}. @{c}</strong><LiveLabel channel={c} liveLogins={liveLogins} status={liveStatus}/></div><div className="creator-dashboard__row"><button className="creator-dashboard__secondary" aria-label={`Move ${c} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button className="creator-dashboard__secondary" aria-label={`Move ${c} later`} disabled={i === draft.channels.length - 1} onClick={() => move(i, 1)}>↓</button><button className="creator-dashboard__secondary" aria-label={`Remove ${c}`} onClick={() => update('channels', draft.channels.filter((v) => v !== c))}>Remove</button></div></li>
                ))}</ol>
                <div className="creator-dashboard__edit-actions"><button onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save private draft'}</button><span className="creator-dashboard__hint">{dirty ? 'Unsaved changes' : 'All changes saved'}</span></div>
                {notice && <p className="creator-dashboard__save-status" role="status">{notice}</p>}
              </section>
            )}
            <p className="creator-dashboard__note">Only selected channels are eligible for your future public link. Favorites and Following are discovery tools, not automatic additions. Save your draft before selecting Make Active or Publish Updates. The public visitor route and chatbot sharing are not live yet.</p>
          </>
        )}
      </main>
    </div>
  );
}
