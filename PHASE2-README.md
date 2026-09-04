# SquadView Monetization Phase 2

This update builds the first visibly Premium Saved Squad capability on top of the Phase 1 entitlement foundation.

## What changes

- Saved Squads now launch **live members only**. Offline Squad members are never automatically opened in the viewer.
- When nobody in a Saved Squad is live, the Watch button is disabled and reads **No one live**.
- Saved Squad cards now separate roster capacity from the viewer limit.
- Every Saved Squad gets an **Edit Squad** action.
- The Saved Squad editor supports:
  - renaming the Squad
  - removing members
  - adding creators by exact Twitch username
  - quick add from **Live now**
  - quick add from **Favorites**
  - searchable **Following** list
- Free users remain capped at 8 creators per Saved Squad.
- Premium users can build Saved Squads with up to 16 creators.
- The active viewer remains capped at 8 streams for both plans.
- If more than 8 Squad members are live, SquadView opens the first 8 live members in saved roster order.

## Database update

Apply:

`supabase/migrations/20260828_squadview_saved_squad_editor.sql`

This adds `public.update_squadview_saved_squad(...)`, an atomic authenticated RPC. Existing RLS and Phase 1 entitlement triggers continue to enforce ownership and the 8/16 member limits server side.

## Files changed

- `src/App.jsx`
- `src/styles.css`
- `src/services/savedSquadService.js`
- `supabase/migrations/20260828_squadview_saved_squad_editor.sql`

## Test focus

1. Premium account can edit a Saved Squad beyond 8 members, up to 16.
2. Free account is blocked when attempting member 9.
3. Opening a Squad loads only currently live members.
4. A Squad with zero live members does not start an offline viewer session.
5. The active viewer still never exceeds 8 streams.
