# SquadView Share Links Phase 1.6

This patch fixes shared current-view links so the recipient actually opens the Twitch roster encoded in the URL.

## Behavior

- Share creates a canonical `/watch?channels=...` link.
- The current focused Twitch channel is included as `active=...`.
- Opening a shared link takes priority over an old viewer session in the recipient's browser.
- Shared channels populate the viewer automatically.
- Anonymous / Free viewers remain limited to 8 Twitch streams.
- Signed-in Premium viewers can restore up to 16 channels from the same shared link after entitlements hydrate.
- The shared view is independent of the sender's localStorage/sessionStorage.
- Existing PWA installation UI remains intact.
- Adds analytics events `shared_view_created` and `shared_view_opened`.

No Supabase migration is required.
