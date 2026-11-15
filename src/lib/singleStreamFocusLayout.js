/**
 * Visual-only single-stream desktop presentation.
 * Never changes viewMode, Twitch player identity, selected chat or audio.
 */
export function shouldAutoExpandSingleStream({
  isDesktopGrid = false,
  viewMode = '',
  desktopGridChat = false,
  desktopChatUsesGridTile = false,
  visibleCount = 0,
  youtubeVisible = false,
  referralPromoVisible = false,
  desktopDualChat = false,
  desktopSixStream = false,
} = {}) {
  return Boolean(
    isDesktopGrid &&
    Number(visibleCount) === 1 &&
    (viewMode === 'dual' || (viewMode === 'chat' && desktopGridChat)) &&
    !desktopChatUsesGridTile &&
    !youtubeVisible &&
    !referralPromoVisible &&
    !desktopDualChat &&
    !desktopSixStream
  );
}


/** True desktop Focus for exactly one selected Twitch channel, not one page tile. */
export function shouldAutoEnterDesktopFocus({
  isDesktopGrid = false,
  streamCount = 0,
  youtubeCompanionPresent = false,
} = {}) {
  return Boolean(
    isDesktopGrid && Number(streamCount) === 1 && !youtubeCompanionPresent
  );
}
