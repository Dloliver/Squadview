# SquadView Ads Phase 1.2 — IMA Playback Fix

This patch targets the production black-screen issue seen after Google IMA fired STARTED.

Changes:
- Uses Google's recommended layout: content video and IMA ad container are separate sibling elements.
- Starts the ad muted for Chrome/Safari autoplay compatibility.
- Adds a Sound on / Mute control once a healthy ad starts.
- Adds a direct Play sponsor fallback when the browser requires a user gesture.
- Keeps the existing 8-second startup and stall fail-open behavior.
- Adds safe production console diagnostics without logging the HilltopAds publisher URL.
- Increases the final hard timeout to 90 seconds; provider skip/completion remains authoritative.
- Fixes service-worker installation by removing the non-file /watch route from app-shell pre-cache.
- Makes /watch and other SPA navigations fall back to the root app shell on GitHub Pages.
- Bumps the service-worker cache to squadview-shell-v8.

No Supabase migration is required.
