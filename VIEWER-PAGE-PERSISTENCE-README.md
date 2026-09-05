# SquadView Viewer Page Persistence Fix

## Goal
Keep the user on the current desktop stream page when a Twitch stream is removed with the X button.

## Behavior
- Removing a stream on page 2, 3, or later keeps the viewer on that same page when the page still exists.
- If removing a stream causes the final page to disappear, SquadView moves only to the new last valid page instead of page 1.
- If the removed stream was focused, SquadView prefers another stream already visible on the current page as the new focus.
- If the removed stream was the desktop page lead, SquadView chooses another visible stream as the lead so the page remains stable.
- Add, replace, reorder, YouTube, and other existing viewer mutations retain their previous behavior.

## Files
- src/App.jsx

No Supabase migration is required.
