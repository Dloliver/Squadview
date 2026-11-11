/** Whether the authenticated Twitch send API may be attempted.
 * Reader status is intentionally NOT a dependency: EventSub is for receiving.
 * Twitch itself still validates user scopes, chat restrictions and permissions.
 */
export function canSendNativeChatMessage({ readerAuthorized, broadcasterUserId, sendBusy }) {
  const id = String(broadcasterUserId || '').trim();
  return readerAuthorized === true && /^\d{1,30}$/.test(id) && !sendBusy;
}
