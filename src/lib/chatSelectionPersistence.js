/**
 * Chat selection is explicit user intent, not a side effect of Twitch player
 * playback, embedded ads, a transient OFFLINE notification or a roster redraw.
 */
export function filterOfflineAutoRemoval(channels, statusByChannel, selectedChatChannel) {
  const selected = channels.includes(selectedChatChannel) ? selectedChatChannel : '';
  return channels.filter((channel) =>
    channel !== selected && statusByChannel.get(channel) === 'offline',
  );
}

/** Moving between pages IS an explicit action: prefer a visible chat then. */
export function chatForExplicitPageChange(selectedChatChannel, nextPageChannels) {
  if (nextPageChannels.includes(selectedChatChannel)) return selectedChatChannel;
  return nextPageChannels[0] || selectedChatChannel;
}
