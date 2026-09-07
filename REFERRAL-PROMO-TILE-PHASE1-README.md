# SquadView Referral Promo Tile — Phase 1

This phase adds the five-minute in-view referral/premium reminder without changing the live Supabase referral schema or the Twitch player implementation.

## Behavior

- Free users accrue qualified watch time only while the viewer is open, the page is visible, and at least two Twitch streams are present.
- At five minutes, the promo becomes ready.
- The promo waits for a safe moment and does not display while Chat mode, Manage Streams, Share Squad, Account, Saved Squad editing/saving, YouTube selection, or the shared-arrival UI is active.
- The promo swaps into one non-focused visible viewer tile. The displaced Twitch player remains mounted off-screen and returns when the promo closes.
- The promo never replaces the focused Twitch tile and never covers the whole viewer.
- Dismiss / Maybe later / CTA engagement suppresses the card for 24 hours on that browser.
- Signed-in users see dynamic referral progress toward the next free month and Lifetime Premium.
- Signed-out users see a Twitch sign-in CTA before they can earn referral credit.
- Premium and Lifetime users do not see the promo.

## Premium benefits shown

- No SquadView ads
- Up to 16 Twitch streams
- Unlimited Saved Squads
- YouTube Companion

## Database

No migration is required. This phase uses the Share + Rewards database functions already installed in production.

## Important Twitch embed behavior

This implementation does not place another page element on top of a visible Twitch embed. Instead, the selected non-focused player is moved out of the visible layout while the SquadView promo card occupies that grid position, then the player is restored when the promo closes.
