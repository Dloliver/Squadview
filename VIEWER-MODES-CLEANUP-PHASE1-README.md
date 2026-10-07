# SquadView Viewer Modes Cleanup Phase 1

Baseline: SquadView-Viewer-Mode-Reference-20260909-160138.zip

This update implements the locked viewer interaction model:

- Focus is a true Solo toggle.
- Solo shows one Twitch stream and makes only that stream audible.
- Clicking the active Focus button again returns to Grid.
- Listen remains additive on desktop during Grid/Chat and is preserved while Solo is active.
- Chat is selected per stream with a dedicated Chat button.
- Clicking another stream's Chat button switches chat without changing desktop Focus/audio.
- Clicking the active Chat button again closes Chat and returns to Grid.
- Desktop smart Chat reserves quadrant four and reflows the displaced Twitch stream into later pages instead of covering it.
- Mobile Chat always shows one Twitch stream plus that same stream's chat.
- The bottom Grid button remains the universal return to streams-only viewing.
- No Supabase changes.
- Referral/Share/Ads logic is not intentionally modified.

Files changed:
- src/App.jsx
- src/components/TwitchPlayer.jsx
- src/styles.css

Verification:
- scripts/verify-viewer-modes-cleanup.mjs
