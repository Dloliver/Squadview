# SquadView Home Stream Compaction Fix

## Purpose
When a user removes a stream from the home-page builder, remaining streamers now shift upward immediately instead of leaving an empty numbered slot in the middle of the list.

Example:

Before removal:
1. tacticalgh0st
2. snipeheeemtv
3. eatingcoolranch

Remove slot 1:
1. snipeheeemtv
2. eatingcoolranch
3. empty

The same compaction behavior applies whether the removal comes from the manual stream-entry list, Favorites, or Following Live builder controls.

## Scope
- `src/App.jsx`
- No Supabase migration
- No ad changes
- No viewer page-navigation changes
- Keeps the previously installed viewer chat continuity and page persistence logic
