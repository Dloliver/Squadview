# SquadView Growth Phase 1: Share Squad + Referral Rewards — September 7 Rebase

This update is rebased onto the fresh SquadView reference dated 2026-09-07.

It preserves the newer viewer work that landed after the original growth bundle, including:

- iOS single-audio-owner handling
- persistent focused Twitch volume
- mobile stream volume controls
- background focused-audio continuity
- the installed-PWA home safe-area adjustment

`src/components/TwitchPlayer.jsx` is intentionally **not replaced** by this bundle.

## Product behavior

- Replaces the icon-only viewer share action with an explicit **Share Squad** control.
- Opens a share modal explaining that the exact current Twitch lineup will be shared.
- Uses the native share sheet where supported and Copy Link as a fallback/action.
- Adds referral attribution to signed-in users' shared SquadView URLs using opaque referral codes.
- Preserves the shared channels and referral code through Twitch sign in by returning OAuth to the current SquadView URL.
- Records pending referral attribution locally for up to 24 hours so the Twitch OAuth round trip does not lose the invite.
- A referral qualifies only after a genuinely new SquadView account signs in with Twitch and reaches the viewer.
- Each Twitch/SquadView identity can qualify once. Self referrals and duplicate identities are rejected server side.
- Every 5 qualified referrals awards another 30 days of promotional Premium.
- Premium reward time stacks from the later of the current promo expiration or the award time.
- At 100 qualified referrals the referring SquadView Twitch account receives Lifetime Premium.
- Referral progress appears inside Share Squad and the signed-in Account modal.
- Promotional and Lifetime Premium remain separate from `plan_key`, preserving the path for RevenueCat paid subscriptions later.
- Existing Free and paid Premium behavior remains supported.
- Adds share/referral analytics without changing Hilltop ad gating, chat, automatic layouts, or Twitch playback scheduling.

## Database

The migration is:

`supabase/migrations/20260907_squadview_share_rewards.sql`

It adds server-authoritative referral persistence and promotional/Lifetime entitlement fields. Browser roles cannot directly write referral counts or award Premium.

## Changed files

- `src/App.jsx`
- `src/styles.css`
- `src/services/accountService.js`
- `src/services/premiumService.js`
- `src/config/plans.js`
- `src/pages/PrivacyPage.jsx`
- `src/pages/TermsPage.jsx`

## New files

- `src/services/referralService.js`
- `supabase/migrations/20260907_squadview_share_rewards.sql`
- `scripts/verify-growth-share-rewards.mjs`
- `GROWTH-SHARE-REWARDS-PHASE1-README.md`

## Recommended local QA

1. Recheck iPhone/iOS audio first: focused audio, paging, Listen behavior, and the new mobile volume control must behave exactly as they do before this install.
2. Confirm the installed PWA landing page still respects the iPhone safe area.
3. Confirm the viewer header shows **Share Squad** rather than an unexplained icon-only action.
4. Open Share Squad with 1, 4, 8, and if available 16 streams.
5. Confirm Copy Link contains the exact `channels` list and active stream.
6. Signed-in user: confirm the URL also contains an opaque `ref=` value.
7. Guest user: confirm sharing still works but no referral code is attached.
8. Open a signed-in referral link in a separate new Twitch/SquadView account and confirm the shared lineup survives Twitch OAuth.
9. Start the shared viewer and confirm the referral is credited only once.
10. Reopen the same link with the same Twitch account and confirm no second credit is added.
11. Confirm an established SquadView account older than 24 hours does not qualify as a new referral.
12. For controlled database testing, advance a test referrer to 5 qualified referrals and confirm Premium becomes active for 30 days.
13. Confirm a later five-referral milestone extends from the existing promo expiration rather than resetting the clock.
14. For a controlled test record at 100 qualified referrals, confirm Lifetime Premium overrides expiration.
15. Confirm Free users still see SquadView ads and retain 8-stream / 3 Saved Squad limits.
16. Confirm referral Premium receives 16-stream, unlimited Saved Squad, and no-SquadView-ads behavior.
17. Confirm existing paid Premium remains Premium even if no referral reward exists.

Do not deploy until `git diff --check`, `npm run build`, the migration, and local QA pass.
