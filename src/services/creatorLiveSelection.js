// SquadView Creator Studio — live-only opening selection.
// This module is intentionally pure: live status must be obtained from an
// authenticated/server-side trusted status endpoint before calling it.
// Never interpret a failed/partial status response as an offline result.
export const CREATOR_ROSTER_LIMIT = 50;
export const CREATOR_OPENING_STREAM_LIMIT = 4;

const normalize = (value) => String(value || '').trim().toLowerCase().replace(/^@/, '');

export function chooseCreatorOpeningStreams({ roster, creatorLogin, liveLogins, statusComplete, random = Math.random }) {
  if (!statusComplete) return { status: 'unavailable', channels: [] };
  if (!Array.isArray(roster) || roster.length > CREATOR_ROSTER_LIMIT) {
    throw new Error('Invalid creator roster');
  }
  if (!(liveLogins instanceof Set)) throw new Error('Confirmed live stream set is required');
  const allowed = [...new Set(roster.map(normalize))];
  if (allowed.some((value) => !/^[a-z0-9_]{1,25}$/.test(value))) throw new Error('Invalid Twitch login');
  const live = new Set([...liveLogins].map(normalize));
  const creator = normalize(creatorLogin);
  // The creator is prioritized ONLY when explicitly approved and confirmed live.
  const chosen = creator && allowed.includes(creator) && live.has(creator) ? [creator] : [];
  const eligible = allowed.filter((channel) => live.has(channel) && channel !== creator);
  for (let i = eligible.length - 1; i > 0; i--) {
    const x = Number(random());
    if (!Number.isFinite(x) || x < 0 || x >= 1) throw new Error('Invalid random source');
    const j = Math.floor(x * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  chosen.push(...eligible.slice(0, CREATOR_OPENING_STREAM_LIMIT - chosen.length));
  return { status: chosen.length ? 'ready' : 'none-live', channels: chosen };
}
