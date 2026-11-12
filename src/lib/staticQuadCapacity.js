/** SquadView 1.0.2 static desktop Grid capacity; pure and deterministic.
 * Workspace dimensions are measured after the app's header/footer, so a
 * browser resize does not quietly change which Twitch channels are visible.
 * Native Twitch iframes stay >=400x300; each visible tile includes its header.
 */
export function chooseStaticQuadCapacity({
  workspaceWidth,
  workspaceHeight,
  viewportWidth,
  compactChatRail = true,
}) {
  const width = Number(workspaceWidth);
  const height = Number(workspaceHeight);
  const viewport = Number(viewportWidth);
  if (![width, height, viewport].every(Number.isFinite) || width <= 0 || height <= 0) return 1;

  const portraitChatBelow = viewport < 1100;
  const rail = compactChatRail
    ? Math.min(300, Math.max(205, viewport * 0.22))
    : Math.min(340, Math.max(280, viewport * 0.22));
  // Cover outer padding, chat gap and the players' own 6px grid gap.
  const stageWidth = width - (portraitChatBelow ? 20 : rail + 24);
  // Portrait keeps a real 250px chat section directly below the fixed grid.
  const stageHeight = height - (portraitChatBelow ? 262 : 14);
  const twoAcross = (stageWidth - 6) / 2 >= 400;
  const twoRows = (stageHeight - 6) / 2 >= 340;
  if (twoAcross && twoRows) return 4;
  if (twoAcross && stageHeight >= 340) return 2;
  return 1;
}
