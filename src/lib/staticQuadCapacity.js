/** SquadView 1.0.2 static desktop Grid capacity; pure and deterministic.
 * Workspace dimensions are measured after the app's header/footer, so a
 * browser resize does not quietly change which Twitch channels are visible.
 * Native Twitch iframes stay >=400x300; each visible tile includes its header.
 */
/**
 * A short, nearly square desktop/PWA window can still accommodate two
 * >=400x300 native Twitch frames in each row if it uses a slim SIDE chat rail,
 * no outer vertical padding, a 3px tile gap and a 27px compact player header.
 * This is deliberately NOT a mobile, true portrait, UltraWide, or Dual Chat
 * decision. Callers opt into the matching side-rail CSS only when true.
 *
 * Row budget: 27px header + 4px player border + 300px Twitch = 331px.
 * Available row: (workspaceHeight - 3px gap) / 2.
 */
export function supportsCompactSideQuad({
  workspaceWidth,
  workspaceHeight,
  viewportWidth,
  viewportHeight,
}) {
  const [width, height, viewportW, viewportH] = [
    workspaceWidth, workspaceHeight, viewportWidth, viewportHeight,
  ].map(Number);
  if (![width, height, viewportW, viewportH].every(Number.isFinite)) return false;
  // Only small landscape-proportioned desktop windows; a physically rotated
  // monitor can still report a landscape app window and use this presentation.
  if (viewportW < 1000 || viewportW >= 1100 || viewportH > 800 || viewportH >= viewportW) return false;
  const chatWidth = Math.min(220, Math.max(205, viewportW * 0.20));
  const streamWidth = width - chatWidth - 4; // 4px side-chat gap, no outer padding
  return (streamWidth - 3) / 2 >= 400 && (height - 3) / 2 >= 331;
}

export function chooseStaticQuadCapacity({
  workspaceWidth,
  workspaceHeight,
  viewportWidth,
  viewportHeight,
  compactChatRail = true,
}) {
  const width = Number(workspaceWidth);
  const height = Number(workspaceHeight);
  const viewport = Number(viewportWidth);
  if (![width, height, viewport].every(Number.isFinite) || width <= 0 || height <= 0) return 1;

  if (supportsCompactSideQuad({ workspaceWidth: width, workspaceHeight: height,
    viewportWidth: viewport, viewportHeight })) return 4;

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
