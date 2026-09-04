# SquadView Mobile Viewport Phase 1.9

This patch keeps mobile stream navigation permanently reachable above the Dual / Chat / Solo toolbar.

## Behavior

- Previous / Next controls stay fixed above the bottom mode toolbar.
- The stream workspace is the only area allowed to scroll when Safari browser chrome leaves insufficient height.
- The final stream can scroll fully above the fixed control dock.
- Standalone PWA mode uses the extra screen height and respects the device safe area.
- Twitch iframe minimum dimensions are not reduced. Twitch currently requires embedded video windows to be at least 400x300.
- Desktop viewer behavior is unchanged.
- No Supabase migration is required.

## Files

- `src/styles.css`
