# SquadView YouTube Companion Phase 1.2

This patch prevents YouTube age-restricted videos from being offered as playable Companion videos.

Changes:
- Reads `contentDetails.contentRating.ytRating` from `videos.list`.
- Filters `ytAgeRestricted` results from YouTube search.
- Rejects an age-restricted pasted URL before opening the player.
- Shows a clear explanation that the video must be watched on YouTube.
- No new API request is added; `contentDetails` is included in the existing video detail request.
- No Supabase migration is required.
