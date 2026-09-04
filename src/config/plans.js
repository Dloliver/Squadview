export const FREE_ENTITLEMENTS = Object.freeze({
  planKey: 'free',
  isPremium: false,
  squadViewAds: true,
  savedSquadLimit: 3,
  maxSquadMembers: 8,
  viewerMaxStreams: 8,
  youtubeCompanion: false,
  multiWindow: false,
  liveSquadAlerts: false,
  persistentSharedSquads: false,
});

export const PREMIUM_FEATURES = [
  {
    key: 'saved_squads',
    title: 'Unlimited Saved Squads',
    description: 'Keep reusable creator groups ready instead of rebuilding the same view every time.',
  },
  {
    key: 'larger_squads',
    title: 'Up to 16 streams in your view',
    description: 'Keep up to 16 Twitch streams in one Premium viewing session and move through them without rebuilding the group.',
  },
  {
    key: 'live_alerts',
    title: 'Live Squad alerts',
    description: 'Know when several members of a saved Squad are live and jump back in with one action.',
  },
  {
    key: 'youtube_companion',
    title: 'YouTube Companion power tools',
    description: 'Premium is prepared for upcoming Second Screen, Multi Window, and persistent Companion workflow controls.',
  },
  {
    key: 'multi_window',
    title: 'Multi Window and Second Screen',
    description: 'Move a stream or the YouTube Companion into another SquadView window or display.',
  },
  {
    key: 'no_squadview_ads',
    title: 'No SquadView ads',
    description: 'Remove SquadView supplied advertising while Twitch and YouTube keep control of their own players.',
  },
];

function booleanOrDefault(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function integerOrDefault(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function normalizeEntitlements(row) {
  if (!row) return { ...FREE_ENTITLEMENTS };

  const planKey = typeof row.plan_key === 'string' && row.plan_key.trim()
    ? row.plan_key.trim()
    : 'free';
  const isPremium = planKey !== 'free';

  return {
    planKey,
    isPremium,
    squadViewAds: booleanOrDefault(row.squadview_ads, !isPremium),
    savedSquadLimit: row.saved_squad_limit === null
      ? null
      : integerOrDefault(row.saved_squad_limit, FREE_ENTITLEMENTS.savedSquadLimit),
    maxSquadMembers: integerOrDefault(
      row.max_squad_members,
      isPremium ? 16 : FREE_ENTITLEMENTS.maxSquadMembers,
    ),
    viewerMaxStreams: integerOrDefault(
      row.viewer_max_streams,
      isPremium ? 16 : FREE_ENTITLEMENTS.viewerMaxStreams,
    ),
    youtubeCompanion: booleanOrDefault(row.youtube_companion, isPremium),
    multiWindow: booleanOrDefault(row.multi_window, isPremium),
    liveSquadAlerts: booleanOrDefault(row.live_squad_alerts, isPremium),
    persistentSharedSquads: booleanOrDefault(row.persistent_shared_squads, isPremium),
  };
}
