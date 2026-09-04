# SquadView YouTube Companion Phase 1.1

Changes:

- Pins the focused/lead Twitch stream to desktop grid slot 1 when YouTube Companion is active.
- Pins YouTube Companion to desktop grid slot 2 on every Twitch roster page.
- Rotates only the remaining Twitch streams through slots 3 and 4.
- Preserves the current 8/16 Twitch roster and optimized pause/quality behavior.
- Sends the YouTube Data API key using the `x-goog-api-key` request header rather than the URL query string.
- Adds clearer key-expired/key-invalid messages.

No Supabase migration is required.
