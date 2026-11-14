/**
 * Select one safe, visible desktop audio fallback when a user pages away from
 * all currently selected streams. Never change an intentionally silent viewer,
 * and never undo a deliberate mute on the incoming page.
 *
 * Inputs are per-session Twitch logins (already normalized by the viewer).
 * This helper has no player, UI, React, storage, or network side effects.
 */
export function chooseDesktopPageAudioFallback({
  audioEnabled,
  visibleChannels = [],
  activeChannel = '',
  activeVolume = 1,
  listeningChannels = [],
  explicitlyMuted = [],
} = {}) {
  if (!audioEnabled || !Array.isArray(visibleChannels) || !visibleChannels.length) return '';

  const visible = [...new Set(visibleChannels.filter((channel) => typeof channel === 'string' && channel))];
  if (!visible.length) return '';
  const selected = new Set(listeningChannels ?? []);
  const muted = new Set(explicitlyMuted ?? []);

  // A manually muted channel on the incoming page is explicit user intent;
  // switching sound to a different tile could be a surprising unmute.
  if (visible.some((channel) => muted.has(channel))) return '';

  // A visible active stream is already the audio owner unless its focused
  // volume is zero. A visible manually selected stream likewise needs no fallback.
  if (visible.some((channel) => selected.has(channel))) return '';
  if (visible.includes(activeChannel) && Number(activeVolume) > 0) return '';

  // The first on-page source will be unmuted through the existing controller
  // once Twitch reports READY. No play() or iframe recreation is requested.
  return visible.find((channel) => channel !== activeChannel) || '';
}
