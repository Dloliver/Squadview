# SquadView Mobile Chat Session Phase 2.0

Purpose: stop mobile Twitch chat from being destroyed/recreated every time the user leaves and re-enters Chat mode.

Changes:
- Keeps one ChatPanel mounted on mobile whenever a viewer has an active Twitch channel.
- Dual and Solo park the chat iframe with CSS instead of unmounting it.
- Changing focused Twitch channels navigates the same chat iframe browsing context.
- Desktop chat behavior is unchanged.
- No Supabase migration.

Primary test on iPhone:
1. Open a multi-stream view.
2. Open Chat for stream A and sign into Twitch once if Twitch asks.
3. Return to Dual.
4. Focus stream B, open Chat, send/read chat.
5. Return to Dual.
6. Focus stream A again and reopen Chat.
7. Confirm Twitch does not require another login.
