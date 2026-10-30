// SquadView Tournament Studio Phase 5.0D.4A — authenticated browser-local draft only.
// DO NOT use this storage/bus for published tournaments, authorized remote directors,
// or OBS Browser Sources. Production requires server-side ownership checks.
const MAX_ROSTER = 16;
export const FORMATS = { solo: 1, duos: 2, trios: 3, squads: 4, custom: 5 };
export const LAYOUTS = { spotlight: 1, versus: 2, trio: 3, quad: 4 };
export const MAX_PRESETS = 12;
const LOGIN_RE = /^[a-z0-9_]{1,25}$/;
export function cleanTwitchLogin(value) {
  const login = String(value ?? '').trim().replace(/^@/, '').toLowerCase();
  return LOGIN_RE.test(login) ? login : '';
}
export function ownerTwitchLogin(user) {
  const data = user?.identities?.find(item => item?.provider === 'twitch')?.identity_data || {};
  const m = user?.user_metadata || {};
  return cleanTwitchLogin(data.preferred_username || data.user_name || data.login ||
    m.preferred_username || m.user_name || m.login);
}
const defaultTeams = () => [
  { id: 'team-a', name: 'Team A' }, { id: 'team-b', name: 'Team B' },
];
export function initialTournament(hostLogin = '', studioMode = 'streamer') {
  return {
    title: studioMode === 'tournament' ? 'Untitled Tournament' : 'Untitled Broadcast',
    studioMode: studioMode === 'tournament' ? 'tournament' : 'streamer',
    game: '', hostLogin: cleanTwitchLogin(hostLogin),
    format: 'trios',
    teamSize: 3, teams: defaultTeams(), roster: [],
    layout: studioMode === 'tournament' ? 'trio' : 'quad', featured: [], audioOwner: '', embedsEnabled: false,
    presets: [], version: 0,
  };
}
export function sanitizeTournament(input, verifiedHostLogin = '') {
  const src = input && typeof input === 'object' ? input : {};
  const hostLogin = cleanTwitchLogin(verifiedHostLogin);
  // Legacy browser-local drafts had no studioMode: keep them in Tournament Mode.
  // New drafts explicitly choose Streamer Mode, so upgrades never erase teams.
  const studioMode = src.studioMode === 'streamer' || src.studioMode === 'tournament'
    ? src.studioMode : 'tournament';
  const format = Object.hasOwn(FORMATS, src.format) ? src.format : 'trios';
  const teamSize = format === 'custom'
    ? Math.max(2, Math.min(MAX_ROSTER, Number.parseInt(src.teamSize, 10) || 5))
    : FORMATS[format];
  const teams = [];
  for (const team of (Array.isArray(src.teams) ? src.teams : defaultTeams()).slice(0, MAX_ROSTER)) {
    const id = String(team?.id || '').slice(0, 45);
    if (!/^[a-z0-9-]{1,45}$/.test(id) || teams.some(t => t.id === id)) continue;
    teams.push({ id, name: String(team?.name || 'Team').trim().slice(0, 40) || 'Team' });
  }
  const roster = [];
  const counts = new Map();
  for (const person of (Array.isArray(src.roster) ? src.roster : []).slice(0, MAX_ROSTER)) {
    const login = cleanTwitchLogin(person?.login);
    if (!login || roster.some(p => p.login === login)) continue;
    let teamId = format === 'solo' ? '' :
      teams.some(team => team.id === person.teamId) ? person.teamId : '';
    if (teamId && (counts.get(teamId) || 0) >= teamSize) teamId = '';
    if (teamId) counts.set(teamId, (counts.get(teamId) || 0) + 1);
    roster.push({ login, teamId });
  }
  const eligible = new Set(roster.map(p => p.login).filter(login => login !== hostLogin));
  const featured = [];
  for (const candidate of Array.isArray(src.featured) ? src.featured : []) {
    const login = cleanTwitchLogin(candidate);
    if (eligible.has(login) && !featured.includes(login) && featured.length < 4) featured.push(login);
  }
  const layout = Object.hasOwn(LAYOUTS, src.layout) ? src.layout : 'trio';
  const visible = featured.slice(0, LAYOUTS[layout]);
  const presets = [];
  for (const saved of (Array.isArray(src.presets) ? src.presets : []).slice(0, MAX_PRESETS)) {
    const name = String(saved?.name || '').trim().slice(0, 35);
    if (!name) continue;
    const savedLayout = Object.hasOwn(LAYOUTS, saved.layout) ? saved.layout : 'quad';
    const selection = [];
    for (const candidate of Array.isArray(saved.featured) ? saved.featured : []) {
      const login = cleanTwitchLogin(candidate);
      if (eligible.has(login) && !selection.includes(login) && selection.length < 4) selection.push(login);
    }
    presets.push({ name, layout: savedLayout, featured: selection });
  }
  return {
    title: String(src.title || (studioMode === 'tournament' ? 'Untitled Tournament' : 'Untitled Broadcast')).trim().slice(0, 72) || 'Untitled Broadcast',
    studioMode, game: String(src.game || '').trim().slice(0, 40), hostLogin, format, teamSize,
    teams, roster, layout, featured,
    audioOwner: visible.includes(src.audioOwner) ? src.audioOwner : '',
    embedsEnabled: src.embedsEnabled === true, presets,
    version: Number.isSafeInteger(src.version) && src.version >= 0 ? src.version : 0,
  };
}

// Team scene buttons are derived from the saved roster and team assignments.
// They do not consume a manual scene preset and automatically follow team edits.
export function teamSceneFor(tournament, teamId, verifiedHostLogin = '') {
  if (!tournament || tournament.format === 'solo' ||
      !Array.isArray(tournament.teams) || !tournament.teams.some(team => team.id === teamId)) return null;
  const hostLogin = cleanTwitchLogin(verifiedHostLogin);
  const members = [];
  for (const person of Array.isArray(tournament.roster) ? tournament.roster : []) {
    const login = cleanTwitchLogin(person?.login);
    if (person?.teamId !== teamId || !login || login === hostLogin || members.includes(login)) continue;
    members.push(login);
  }
  if (!members.length) return null;
  const featured = members.slice(0, 4);
  const layout = ['','spotlight','versus','trio','quad'][featured.length];
  return { layout, featured, audioOwner: '', memberCount: members.length };
}
export function isTeamSceneActive(tournament, scene) {
  if (!tournament || !scene || tournament.layout !== scene.layout) return false;
  const current = (Array.isArray(tournament.featured) ? tournament.featured : []).slice(0, LAYOUTS[scene.layout]);
  return current.length === scene.featured.length && current.every((login, i) => login === scene.featured[i]);
}

// Preview/program switcher: all helpers are pure, so preview never writes to the OBS stage.
export function switcherScene(value, tournament, verifiedHostLogin = '') {
  const layout = Object.hasOwn(LAYOUTS, value?.layout) ? value.layout : 'spotlight';
  const allowed = new Set((tournament?.roster || []).map(person => cleanTwitchLogin(person.login))
    .filter(login => login && login !== cleanTwitchLogin(verifiedHostLogin)));
  const featured = [];
  for (const raw of Array.isArray(value?.featured) ? value.featured : []) {
    const login = cleanTwitchLogin(raw);
    if (allowed.has(login) && !featured.includes(login) && featured.length < LAYOUTS[layout]) featured.push(login);
  }
  return { layout, featured };
}
export function switcherLayout(scene, layout, tournament, hostLogin = '') {
  if (!Object.hasOwn(LAYOUTS, layout)) return switcherScene(scene, tournament, hostLogin);
  const existing = switcherScene(scene, tournament, hostLogin).featured;
  const eligible = (tournament?.roster || []).map(person => cleanTwitchLogin(person.login))
    .filter(login => login && login !== cleanTwitchLogin(hostLogin) && !existing.includes(login));
  return switcherScene({ layout, featured: [...existing, ...eligible] }, tournament, hostLogin);
}
export function switcherSetSlot(scene, rawLogin, slot, tournament, hostLogin = '') {
  const current = switcherScene(scene, tournament, hostLogin);
  const login = cleanTwitchLogin(rawLogin);
  const index = Number(slot);
  if (!login || login === cleanTwitchLogin(hostLogin) ||
      !(tournament?.roster || []).some(person => person.login === login) ||
      !Number.isInteger(index) || index < 0 || index >= LAYOUTS[current.layout]) return current;
  // Choosing a channel already on another slot swaps the two, avoiding duplicate embeds.
  const channels = Array.from({ length: LAYOUTS[current.layout] }, (_, i) => current.featured[i] || '');
  const previousSlot = channels.indexOf(login);
  if (previousSlot !== -1 && previousSlot !== index) channels[previousSlot] = channels[index];
  channels[index] = login;
  return switcherScene({ layout: current.layout, featured: channels }, tournament, hostLogin);
}
export function switcherClearSlot(scene, slot, tournament, hostLogin = '') {
  const current = switcherScene(scene, tournament, hostLogin);
  const index = Number(slot);
  if (!Number.isInteger(index) || index < 0 || index >= LAYOUTS[current.layout]) return current;
  return switcherScene({ ...current, featured: current.featured.filter((_, i) => i !== index) }, tournament, hostLogin);
}
export function switcherSameScene(a, b, tournament, hostLogin = '') {
  const first = switcherScene(a, tournament, hostLogin);
  const next = switcherScene(b, tournament, hostLogin);
  return first.layout === next.layout && first.featured.join('|') === next.featured.join('|');
}

// UUID is supplied by Supabase Auth. Never fall back to a shared anonymous key.
export function tournamentStorageKey(userId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(userId || ''))) throw new Error('Authenticated user required.');
  return `squadview:tournament:director-local:v1:${userId}`;
}
export function readTournament(userId, hostLogin = '') {
  const key = tournamentStorageKey(userId);
  try {
    const raw = localStorage.getItem(key);
    return sanitizeTournament(raw ? JSON.parse(raw) : initialTournament(hostLogin), hostLogin);
  } catch {
    return sanitizeTournament(initialTournament(hostLogin), hostLogin);
  }
}
export function writeTournament(userId, hostLogin, candidate) {
  const key = tournamentStorageKey(userId);
  const state = sanitizeTournament(candidate, hostLogin);
  state.version = Math.max(Date.now(), readTournament(userId, hostLogin).version + 1);
  // If storage is blocked or full, throw: do not pretend this was saved.
  localStorage.setItem(key, JSON.stringify(state));
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const bus = new BroadcastChannel(`${key}:scene`);
      bus.postMessage(state); bus.close();
    } catch { /* localStorage events still synchronize other tabs */ }
  }
  return state;
}
export function subscribeTournament(userId, hostLogin, callback) {
  const key = tournamentStorageKey(userId);
  let latest = readTournament(userId, hostLogin).version;
  const accept = raw => {
    const state = sanitizeTournament(raw, hostLogin);
    if (state.version < latest) return;
    latest = state.version;
    callback(state);
  };
  const onStorage = event => { if (event.key === key) accept(readTournament(userId, hostLogin)); };
  window.addEventListener('storage', onStorage);
  let bus;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      bus = new BroadcastChannel(`${key}:scene`);
      bus.onmessage = event => accept(event.data);
    } catch { /* storage events remain available */ }
  }
  return () => { window.removeEventListener('storage', onStorage); bus?.close(); };
}
export function appendCompetitors(current, entries, hostLogin) {
  const next = [...current.roster];
  let added = 0;
  for (const raw of entries) {
    const login = cleanTwitchLogin(raw);
    if (!login || next.some(person => person.login === login) || next.length >= MAX_ROSTER) continue;
    next.push({ login, teamId: '' }); added++;
  }
  const count = LAYOUTS[current.layout];
  const featured = [...current.featured];
  // First-time setup: fill empty Program so a new organizer sees a stage.
  // Once Program has competitors, roster edits must never silently put someone ON AIR.
  if (!featured.length) {
    for (const person of next) {
      if (featured.length >= count) break;
      if (person.login !== hostLogin && !featured.includes(person.login)) featured.push(person.login);
    }
  }
  return { ...current, roster: next, featured, added };
}
export function normalizeFollowedChannels(result) {
  const raw = Array.isArray(result) ? result :
    (result?.channels || result?.followedChannels || result?.followed_channels || result?.data || []);
  if (!Array.isArray(raw)) return [];
  const unique = new Map();
  for (const record of raw) {
    const obj = typeof record === 'string' ? { login: record } : (record || {});
    const login = cleanTwitchLogin(obj.login || obj.broadcaster_login || obj.user_login ||
      obj.twitch_login || obj.username || obj.channel || obj.name);
    if (!login || unique.has(login)) continue;
    unique.set(login, { login, label: String(obj.display_name || obj.broadcaster_name || obj.displayName || login),
      avatar: String(obj.profile_image_url || obj.profileImageUrl || obj.avatar_url || obj.avatar || '') });
  }
  return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label));
}
