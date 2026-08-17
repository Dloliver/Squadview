# SquadView homepage and viewer split

This update separates SquadView into two public experiences:

* `/` is the original content and product homepage.
* `/watch` is the interactive Twitch viewing tool.

The viewer behavior from the supplied source package is preserved, including refresh restoration, desktop grid chat behavior, stable focus ordering, solo and chat paging, favorites, and responsive layouts.

## Advertising placement

AdSense display slots are intentionally kept on the original content homepage. The `/watch` experience does not render the existing Home, Footer, or loading AdSense placements. This keeps Google served advertising separate from the Twitch embed workspace while the site is being reviewed.

The global AdSense account script remains in `index.html` so the site can still be detected and reviewed by Google.

## Other updates

* PWA start URL now opens `/watch`.
* The service worker cache version is updated and includes both `/` and `/watch`.
* The sitemap contains the homepage, viewer, About, Help, Privacy, and Terms pages.
* Page metadata and canonical URLs distinguish the homepage, viewer, and information pages.
