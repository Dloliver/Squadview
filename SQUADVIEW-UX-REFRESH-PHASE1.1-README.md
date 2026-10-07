# SquadView UX Refresh — Phase 1.1

Built on top of the successfully installed **SquadView UX Refresh Phase 1** baseline.

## Included in this pass

- Wide desktop keeps the new dedicated Chat rail with all four Twitch tiles visible.
- The Chat rail now has a visible **Dock left / Dock right** control.
- The chosen desktop Chat side is remembered locally in the browser.
- At narrower desktop/tablet widths, Grid + Chat no longer pushes Chat below the streams. Chat deliberately becomes the **fourth 2x2 tile**.
- In that compact Grid + Chat layout, the chat owner's stream stays anchored while the other three-slot Twitch roster pages around it.
- If YouTube Companion is also active at the compact width, the 2x2 layout becomes two Twitch streams + YouTube + Chat.
- Normal Grid paging remains unchanged when Chat is closed.

## Local Twitch sign-in

No code overwrite is required for the OAuth return target. `src/services/accountService.js` already requests the **current browser URL** as Supabase's `redirectTo`, which means a sign-in started from `http://localhost:5173` is already asking to return to localhost.

If Twitch sign-in instead lands on `https://squadview.app`, Supabase is falling back to the project's production Site URL because localhost is not currently accepted as an OAuth redirect destination.

For local QA, add these entries in the Supabase project used by SquadView:

- `http://localhost:5173/**`
- Optional: `http://127.0.0.1:5173/**`

In the Supabase dashboard this is under **Authentication → URL Configuration → Redirect URLs**. Keep the production Site URL and production redirect entries in place; localhost should be an additional development redirect, not a replacement.

After saving that setting, begin Twitch sign-in again from the local SquadView tab. The same local tab/origin should receive the authenticated session, allowing Following Live, Favorites, and native chat to be tested against the Phase 1 code before production deployment.

## QA targets

1. Full-width Grid + Chat: four Twitch streams remain visible plus the Chat rail.
2. Use **Dock left**, then **Dock right**; Chat should move without rebuilding or pausing the streams.
3. Reduce the browser width below the wide-chat breakpoint: Chat should take the bottom-right fourth tile rather than disappear below the fold.
4. With four Twitch channels in compact Grid + Chat, three streams + Chat appear on the first page; the chat owner remains visible when paging to the remaining stream.
5. Close Chat: all four Twitch positions return to normal full-page Grid behavior.
6. After adding localhost to Supabase Redirect URLs, sign in from `localhost:5173` and confirm the browser returns to localhost rather than the production landing page.
