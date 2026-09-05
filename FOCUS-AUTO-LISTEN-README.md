# SquadView Focus Auto Listen Fix

This patch changes viewer audio behavior only.

## Behavior

- Clicking Focus on a Twitch stream automatically makes that focused stream audible.
- The focused stream no longer requires a separate Listen click.
- Other streams keep the existing Listen toggle behavior.
- Streams that were manually set to Listen remain audible alongside the focused stream.
- Moving Focus to another stream automatically transfers the focused-audio behavior to the newly focused stream.
- Desktop paging, Chat continuity, stream removal/page persistence, ads, Saved Squads, and YouTube Companion are unchanged.
- A hard refresh still restores the viewer muted until the viewer interacts with audio again, preserving browser autoplay safety.

No Supabase migration is required.
