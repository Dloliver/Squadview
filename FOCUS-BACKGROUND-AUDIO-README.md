# SquadView Focus Background Audio Fix

## Behavior

- Focus still automatically owns audio.
- When the viewer moves to another desktop page/group, the focused stream keeps playing audio in the background even if its player is temporarily off-page.
- Non-focused streams keep the existing behavior: off-page streams are muted/paused unless visible again.
- Explicit Listen selections still work as before when those streams are visible.
- Returning to the focused stream's page does not require another Listen click.

## Files

- `src/App.jsx`
- `src/components/TwitchPlayer.jsx`

No Supabase migration is required.
