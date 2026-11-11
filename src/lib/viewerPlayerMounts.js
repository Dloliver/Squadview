/**
 * Viewer Core A: bound mounted Twitch embeds to the visible layout and the
 * warm-player exceptions already supported by App/TwitchPlayer. No browser
 * or Twitch calls occur here, and no audio selection is changed.
 *
 * Previously mounted survivors are kept in order so React's stable channel
 * keys do not move their iframe DOM nodes unnecessarily. Inactive pages fall
 * out of the result and React releases their embeds.
 */
export function selectBoundedMountedChannels({
  previouslyMounted = [],
  roster = [],
  visible = [],
  warm = [],
} = {}) {
  const allowedRoster = new Set(roster);
  const permitted = new Set(
    [...visible, ...warm].filter((channel) => allowedRoster.has(channel)),
  );
  const selected = [];
  const seen = new Set();

  const retain = (channel) => {
    if (!permitted.has(channel) || seen.has(channel)) return;
    seen.add(channel);
    selected.push(channel);
  };

  for (const channel of previouslyMounted) retain(channel);
  for (const channel of visible) retain(channel);
  for (const channel of warm) retain(channel);

  return selected;
}
