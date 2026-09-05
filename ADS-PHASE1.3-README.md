# SquadView Ads Phase 1.3 — User-Initiated IMA Playback

This patch targets the remaining production issue where HilltopAds returned a valid VAST creative, IMA emitted STARTED, and remaining time briefly decreased, but the visible ad player stayed black and then stalled.

Changes:
- Removes the empty publisher content `<video>` from the SquadView loading screen.
- Lets Google IMA own its ad playback element inside the dedicated ad container.
- Loads the VAST response first, then presents `Play short sponsor` once AdsManager is ready.
- Calls `AdDisplayContainer.initialize()`, `AdsManager.init()`, and `AdsManager.start()` directly inside the user's click handler.
- Signals `setAdWillAutoPlay(false)` because playback now begins from an explicit user action.
- Signals `setAdWillPlayMuted(false)` and starts the user-initiated commercial with sound enabled.
- Keeps the existing no-fill, ad-error, stall, cooldown, Premium bypass, and hard fail-open behavior.

No Supabase migration is required.
