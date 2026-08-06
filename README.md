# SquadView dual-stream mixer

This overwrite keeps two Twitch players mounted and visible, places chat below them, and lets the viewer rotate only the non-active stream through the remaining selected channels.

## Run

```bash
npm install
npm run dev
```

## Viewer controls

- **Play & listen** selects the active audio stream and changes chat to that channel.
- **Previous / Next** rotates the other visible stream while keeping the active stream in place.
- On phones the two players are stacked.
- On wide screens the two players sit side by side.
- Chat is always in the normal document flow below the streams and never overlays a player.


## Compact dual-stack update

- Keeps the accepted two-stream mixer layout.
- Uses 16:9 stream cards to reduce vertical scrolling.
- Keeps chat directly below the streams in a compact panel.
- Replaces the prior stylesheet rules rather than appending an override patch.
- Twitch chat login and typing can still depend on browser cookie/privacy settings; test on a physical phone and a normal browser window, not only device emulation.
