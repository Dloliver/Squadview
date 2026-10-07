# SquadView Desktop Audio Independence Fix

Built from the fresh `SquadView-Audio-Debug-Reference-20260908-151700.zip` baseline.

## What the audit found

The referral promo code did not change `TwitchPlayer.jsx`; the currently deployed Twitch player is still the September 7 audio build. The desktop regression is in the September 7 focus/listen path rather than the referral reward code.

Two desktop behaviors changed in that build:

1. A desktop Focus click began rewriting mute/volume state across every mounted Twitch player. That gives one click an opportunity to silence other streams even when the viewer explicitly selected them with Listen.
2. Desktop Listen/Focus stopped using their direct user gesture to call Twitch `play()`. If a player had been paused by SquadView's hidden/off-page scheduler, selecting it could restore mute/volume state without reliably restarting playback.

## This patch

- Keeps the iPhone/iPad single-audio-owner path unchanged.
- On desktop/non-iOS, Focus touches only the newly focused player immediately. It no longer rewrites all other players during the Focus click.
- Existing `listeningChannels` remain the authority for extra audible streams, so manually enabled Listen streams remain independent while Focus moves.
- Turning Listen on for a desktop stream uses that direct click to call `play()` on only that stream before restoring its audio level.
- Adds `window.__squadViewAudioDebug()` and expands `window.__squadViewPlayerDebug()` with volume/audio/scheduler state. This is diagnostic only and is useful if the intermittent remove-stream playback issue still reproduces.
- Referral Share/Rewards and the five-minute promo tile are preserved unchanged.
- No Supabase migration.
- No CSS change.

## Test priority

1. Desktop: enable Listen on two non-focused streams, then move Focus repeatedly. The manually selected streams should remain audible.
2. Desktop: remove focused and non-focused streams and confirm remaining visible players keep moving without a refresh.
3. Desktop: add a stream back and repeat Focus/Listen.
4. iPhone installed PWA: confirm the single-audio-owner behavior remains unchanged.

If the removal issue reproduces, open DevTools Console before refreshing and run:

```js
window.__squadViewAudioDebug?.()
```

The returned object is safe playback state only; it does not contain OAuth tokens or Supabase secrets.
