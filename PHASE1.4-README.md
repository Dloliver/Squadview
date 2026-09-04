# SquadView Mobile Viewer Phase 1.4

Mobile YouTube Companion behavior:

- Mobile Dual + YouTube renders exactly two visible media panels:
  1. focused Twitch stream
  2. YouTube Companion
- Previous/Next changes only the focused Twitch stream.
- YouTube remains the same Companion while cycling through the Twitch roster.
- Opening Chat keeps focused Twitch on top and gives the lower panel to Twitch chat.
- YouTube remains mounted but hidden/paused in Chat, so it is not removed from the session.
- Closing Chat returns the same YouTube Companion at its preserved playback position.
- Desktop behavior from Phase 1.3 is unchanged.
- No Supabase migration is required.
