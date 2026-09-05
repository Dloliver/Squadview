# SquadView Desktop Quick Watch Fix

Small QOL patch for the home builder.

## Behavior

- The existing `builder-quick-watch-dock` already appears whenever at least one valid Twitch username is selected.
- On mobile it is fixed to the bottom of the viewport.
- This patch gives desktop the same immediate behavior: once one valid name is entered, the Start watching button remains visible at the bottom center of the viewport.
- The button uses the existing `beginWatching()` flow, so ads, Premium bypass, stream limits, and all viewer behavior are unchanged.

## Files

- `src/styles.css`

No Supabase migration is required.
