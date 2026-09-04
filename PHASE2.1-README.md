# SquadView Monetization Phase 2.1

This correction aligns the Premium viewer with the intended product behavior.

## Viewer limits

- Free: up to 8 Twitch streams in the current viewing roster.
- Premium: up to 16 Twitch streams in the current viewing roster.
- Premium Saved Squads: up to 16 creators.

SquadView does not render all 16 Twitch embeds at once. Existing desktop paging/focus behavior remains in place, so the user can move through the larger roster while only the streams currently on screen are loaded.

## Saved Squad launch behavior

Opening a Saved Squad still auto-adds only members who are live. Free loads up to 8 live members; Premium can load up to 16 live members into the viewing roster.

## Files

- `src/App.jsx`
- `src/config/plans.js`
- `supabase/migrations/20260828_squadview_premium_16_viewer.sql`
