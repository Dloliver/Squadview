# SquadView Ads Phase 1.4 — Seamless Start + Immersive Mobile

This phase changes only the SquadView supplied VAST loading break.

## What changes

- Removes the second `Play short sponsor` tap for normal Start Squad / Saved Squad launches.
- Prepares the HilltopAds VAST response while a Free user has a clear watch intent.
- Uses the user's existing `Start watching` / Saved Squad click to call Google IMA `AdDisplayContainer.initialize()` directly.
- Starts the prepared sponsor automatically from that same click.
- Keeps fail-open behavior if IMA, the VAST tag, or the creative is unavailable.
- Shared-link arrivals attempt muted autoplay because there is no prior Start Squad click to borrow; if a browser refuses it, SquadView fails open instead of asking for another tap.
- On phones, once the ad starts, the IMA ad stage expands to the full dynamic viewport.
- Desktop keeps the existing centered SquadView loading-card presentation.
- The IMA creative remains `contain`/uncropped so advertiser CTA and Skip Ad controls remain available.
- Premium continues to bypass SquadView supplied ads.
- Existing 20 minute cooldown remains unchanged.

## Files changed

- `src/App.jsx`
- `src/components/ads/VastLoadingAd.jsx`
- `src/styles.css`
- `src/config/advertising.js` (carried forward unchanged from Phase 1.3)

No Supabase migration is required.

## Expected builder flow

Free user:

`Select streams -> Start watching -> sponsor starts automatically -> Skip/end -> viewer`

There should be no second SquadView sponsor-start button.

Premium user:

`Start watching -> viewer`

## Local development

With `VITE_ADS_TEST_MODE=true`, selecting a valid stream prepares a simulated ad break. Clicking Start watching should open the simulated break immediately and then continue to the viewer automatically.

## Production safety

Keep production VAST disabled until the ad network confirms the requested family-safe exclusions for SquadView. The code does not attempt to classify or filter creatives locally; category/creative enforcement must happen at the ad-network level.
