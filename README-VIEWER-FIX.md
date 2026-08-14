# SquadView viewer refresh and desktop chat fix

This overwrite contains two changed files:

- `src/App.jsx`
- `src/styles.css`

## Changes

1. Active viewer state is saved in session storage so refreshing the current tab restores the group, focused channel, view mode, dual slots, and desktop page.
2. Refreshed viewers restart muted so the browser does not block the restored Twitch players because of autoplay audio restrictions.
3. Desktop viewer height is made explicit so Twitch player viewports do not collapse to header-only rows after a hard refresh.
4. Desktop Chat mode now shows only the focused Twitch stream plus that stream's chat, matching mobile behavior.
5. Desktop page controls only appear in Grid mode. In Chat and Solo modes, the Next button cycles the focused stream instead.

## Test after overwrite

- Start a group with 3 or more streams on desktop, refresh the browser, and confirm the Twitch video areas return at full size.
- Switch to Chat and confirm only one stream plus its chat are shown.
- In Chat, use Next and confirm it changes both the focused stream and chat channel.
- Confirm mobile Dual, Chat, and Solo still behave as before.
