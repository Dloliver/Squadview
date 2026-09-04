# SquadView Ads Phase 1.1 — VAST reliability

This patch hardens the existing HilltopAds + Google IMA loading commercial.

Changes:
- No-start requests warn after 5 seconds and fail open after 8 seconds.
- `STARTED` is no longer treated as proof that a creative is healthy.
- After `STARTED`, SquadView polls Google IMA `AdsManager.getRemainingTime()` once per second to confirm playback is actually advancing.
- A started ad whose remaining time stops advancing fails open after 8 seconds.
- A visible `Continue to SquadView` fallback appears for slow/stalled ads.
- Normal skipped/completed ads continue through the existing flow.
- Premium ad bypass and the 20-minute cooldown are unchanged.
- No Twitch, chat, PWA, YouTube, Supabase, or viewer-layout changes.

No Supabase migration is required.
