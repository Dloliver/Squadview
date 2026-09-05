# SquadView Viewer Chat Continuity Fix

This patch makes desktop Grid + Chat preserve the current Twitch page instead of pausing the stream displaced by chat.

Behavior:

- Chat continues to visually own quadrant four.
- If the focused Twitch stream was in quadrant four, it moves to quadrant three while chat is open.
- The Twitch stream displaced from quadrant three stays mounted and playing underneath the chat tile.
- Closing chat returns to the four stream grid without intentionally pausing/restarting the desktop page.
- Returning to Dual also issues a user-gesture playback resume for the streams that are about to be visible as a browser autoplay safety net.
- Off-page roster streams still use the existing pause/performance scheduling. This patch only preserves the current viewer page through the Chat transition.
- YouTube Companion keeps its pinned desktop slot behavior.

No Supabase migration is required.
