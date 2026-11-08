/**
 * Fit a full 16:9 Twitch embed inside a viewport without clipping.
 * The underlying Twitch iframe keeps at least 400x300 CSS pixels so its
 * controls and initialization remain compatible; CSS transforms only
 * its on-screen presentation when space is short.
 *
 * No audio, playback, channel, or iframe lifecycle state is changed here.
 */
export function calculateTwitchViewportFit(viewportWidth, viewportHeight) {
  const width = Number(viewportWidth);
  const height = Number(viewportHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const ratio = 16 / 9;
  const fittedWidth = Math.min(width, height * ratio);
  const fittedHeight = fittedWidth / ratio;
  const embedWidth = Math.max(fittedWidth, 300 * ratio);
  const embedHeight = embedWidth / ratio;
  const scale = fittedWidth / embedWidth;

  return { embedWidth, embedHeight, scale, fittedWidth, fittedHeight };
}
