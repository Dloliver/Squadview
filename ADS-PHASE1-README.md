# SquadView Ads Phase 1 — HilltopAds VAST loading commercial

This phase adds a provider-independent SquadView loading ad break backed by the HilltopAds VAST/IMA tag already configured locally.

## Behavior

Free users:
- Starting a new SquadView can trigger one SquadView supplied VAST video ad.
- Opening a Saved Squad can trigger the same ad break.
- Opening a shared Squad link can trigger the ad after the recipient plan is resolved.
- Next / Previous / Dual / Chat / Solo / audio focus do not trigger additional ads.
- The loading ad uses a 20 minute browser cooldown by default.
- If the ad fails, times out, or the SDK cannot load, SquadView continues to the viewer.
- If an ad has not started after 8 seconds, a Continue to SquadView fallback appears.
- A 45 second hard safety timeout prevents an ad provider failure from trapping the viewer.

Premium users:
- `squadview_ads = false` bypasses the SquadView loading ad completely.

## Local vs production

Development defaults to test mode, so localhost shows a short simulated ad break instead of requesting live HilltopAds inventory.

Production needs:
- `VITE_ADS_ENABLED=true`
- `VITE_ADS_TEST_MODE=false`
- `VITE_DISPLAY_ADS_ENABLED=false`
- `VITE_HILLTOPADS_VAST_URL=<your HilltopAds IMA/VAST invocation URL>`
- `VITE_LOADING_AD_COOLDOWN_MINUTES=20`

The live VAST URL should remain in `.env.local` / `.env.production.local`, not Git.

## Display ads

The legacy AdSense script is intentionally removed and legacy display slots are disabled until a display provider is intentionally chosen. This phase is only the loading-commercial path.

## Privacy note

The existing `strict-origin-when-cross-origin` referrer policy is preserved. Do not replace it with `no-referrer-when-downgrade` while shared Squad URLs contain channel names in query parameters; the stricter policy avoids sending those query strings as cross-origin referrer data to ad providers.

## No database migration

This phase uses the existing `squadview_ads` entitlement. No Supabase migration is required.
