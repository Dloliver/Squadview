# SquadView YouTube Companion Phase 1

This bundle is based on the post-performance reference uploaded on 2026-08-29.

## What changes

- Adds one YouTube Companion video maximum to an active SquadView viewer.
- Adds in-app YouTube search and direct YouTube URL/video-ID entry.
- Uses the official YouTube embedded player in privacy-enhanced mode.
- Does not require Google/YouTube login.
- Does not add YouTube chat, subscriptions, follows, or account linking.
- Desktop Grid reserves one quadrant for YouTube, leaving up to three visible Twitch players on that page.
- Twitch channels remain in the 8/16 stream roster and can still be paged normally.
- When Chat or Solo hides the Companion, SquadView sends a pause command so YouTube is not intentionally used as background playback.
- Adding/replacing the Companion never allows a second YouTube video.
- Search results are checked for embedding eligibility and Made for Kids videos are excluded in this first release.
- Adds YouTube/Google disclosures to Privacy and Terms.
- Adds generic YouTube Companion analytics events without sending titles, video IDs, channels, or search terms to SquadView analytics.

## Important monetization note

YouTube's current Developer Policies prohibit charging users to watch content in an embedded YouTube player or otherwise gating access to the selected video. For that reason, the base Companion player/search is not paywalled in this bundle. Premium differentiation remains the 16-stream Twitch roster and Saved Squad features already built, while the Premium YouTube value will come from upcoming Second Screen / Multi Window / persistent workflow controls around the Companion.

The existing `youtube_companion` entitlement remains reserved for those Premium power tools.

## Google Cloud requirement

Set `VITE_YOUTUBE_DATA_API_KEY` in `.env.local` before testing search/playback validation.

The browser key is intentionally public. In Google Cloud, restrict it to:

- YouTube Data API v3 only
- HTTP referrers used by SquadView, including localhost during testing and squadview.app in production

No OAuth client is required for this phase because only public YouTube data is requested.

## No Supabase migration

This phase does not change the database schema.
