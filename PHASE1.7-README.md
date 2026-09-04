# SquadView Share Growth Phase 1.7

This patch builds on the PWA install and shared-link work.

## Changes

- Shared links open with a lightweight Shared SquadView arrival dialog.
- The recipient can start watching immediately or install SquadView from the same dialog.
- The existing device-aware Install SquadView system is reused; no app-store download is required.
- Free and signed-out recipients now load only the first 8 channels from a larger shared view immediately.
- Signed-in Premium recipients can restore all shared channels up to the Premium 16-stream entitlement after account hydration.
- A Free recipient opening a larger shared view sees a contextual message such as `8 of 16 streams loaded` rather than a generic paywall.
- Adds analytics markers for shared-view arrival display, continue, and dismiss behavior.

No Supabase migration is required.
