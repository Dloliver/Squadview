# SquadView Viewer Focus + Chat + Audio Phase 1.1

Baseline: `SquadView-Viewer-Modes-PostTest-20260909-202530.zip`

This update is intentionally limited to the viewer interaction/audio layer.

## Desktop Focus

- Focus remains a true toggle.
- Clicking Focus makes that Twitch stream the only visible Twitch stream.
- The focused stream is the only audible Twitch stream while Focus is active.
- The focused stream's matching Twitch chat opens beside it automatically on desktop.
- Clicking Focus again returns to Grid.
- Existing desktop Listen selections are preserved underneath Focus and become available again after returning to Grid.
- Mobile Focus keeps the existing behavior and does not receive the desktop-only chat panel.

## Desktop Chat switching

- Chat remains independent from visual Focus and the normal desktop audio mix.
- Clicking Chat on another stream changes only the chat target.
- Clicking the active Chat button again returns to Grid.
- Smart Chat still reserves the fourth quadrant and reflows the displaced Twitch stream into later pages.
- A stream explicitly selected for audio is no longer muted just because smart Chat temporarily moves its tile off the current page.
- Before a desktop chat switch, SquadView snapshots currently audible Twitch streams and their current volume so a Twitch-native volume adjustment is not accidentally lost during the reflow.
- Off-page streams that are not selected for audio still use the normal pause/mute performance scheduler.

## Files changed

- `src/App.jsx`
- `src/components/TwitchPlayer.jsx`
- `src/styles.css`
- `scripts/verify-viewer-focus-chat-audio.mjs`

No Supabase migration is required. Referral, rewards, ads, Premium entitlements, Saved Squads, and sharing are not intentionally modified.
