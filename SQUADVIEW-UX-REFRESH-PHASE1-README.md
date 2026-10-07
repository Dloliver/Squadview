# SquadView UX Refresh — Phase 1

Built from the `SquadView-UX-Refresh-Reference-20261007-133904.zip` baseline.

## Included in this pass

- `squadview.app/` now opens the actual SquadView builder/app first.
- The prior public marketing homepage remains available at `/learn`.
- Signed-out users can still build as guests. Starting to type a channel triggers a one-time-per-tab Twitch benefits prompt with a clear **Continue without signing in** option.
- Following Live sorts live SquadView Favorites first, then the remaining live followed channels.
- Automatic background live/offline checks stay focused on Favorites. The full Twitch follow list refreshes on connection, when Following Live is opened, or when the user presses Refresh.
- Desktop Grid pages now swap the entire page when Chat is closed.
- When Chat is open, the stream that owns Chat stays visible while the other stream positions page around it.
- Desktop Chat is a dedicated slim rail and no longer consumes the fourth Twitch tile.
- Resized desktop/tablet windows keep the 2x2 grid down to the new 761px app breakpoint instead of falling into the two-stream mobile carousel too early.
- Focus mode includes a direct channel-pill selector for the full Squad.
- SquadView Rewards no longer replaces a live stream tile. It appears as a floating dismissible card.
- Opening Manage Streams reasserts playback for currently visible Twitch players under the same user gesture.
- The marketing sitemap/canonical flow now includes `/learn`.

## Deliberately deferred to the next pass

These were discussed, but should come after this structural pass is tested in the live viewer:

- Native-chat `@username` autocomplete / click-to-mention.
- Optional sound for direct mentions/replies.
- A richer fixed selected-channel tray on Following Live (the current selected-view dock remains in place for now).
- Optional user-selectable chat dock position (right is the Phase 1 desktop default).
- A separate explicit Pin feature, if it still feels necessary after Chat anchoring is tested.

## Important behavior to QA

1. Four Twitch streams + Chat on a wide desktop: all four streams should remain visible, with Chat in the slim right rail.
2. With no Chat selected, Page 1 and Page 2 should swap all Twitch tiles.
3. With Chat selected, its streamer should remain visible when paging; the other positions should rotate.
4. Close Chat: normal full-page paging should resume and no Rewards tile should replace a stream.
5. Focus a stream, then use the channel pills to jump directly to another streamer.
6. Open Manage Streams several times and confirm visible streams do not pause solely because the drawer opened.
7. Resize a desktop window below the old 1100px breakpoint and confirm the viewer keeps a useful 2x2 grid where space permits.
8. On `/`, type a Twitch username while signed out and confirm the benefits modal appears once, while **Continue without signing in** keeps guest mode usable.
9. Open Following Live while signed in: live Favorites should appear first. Leave the page open long enough for a favorite live-status refresh and confirm favorite online/offline changes are reflected without refreshing every followed channel.
