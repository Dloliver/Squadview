# SquadView AdSense minimum content pass

This update keeps the existing SquadView viewer experience intact and adds only the public information and crawlability pieces needed for an AdSense resubmission pass.

## Added

- `/about` page with original SquadView product information
- Expanded `/support` into Help & FAQ content
- About and Help links in the public footer
- Two paragraphs of original publisher content on the home page
- `robots.txt`
- `sitemap.xml`
- GitHub Pages route restoration so direct links to public information pages work after the 404 redirect

## Existing pages kept

- `/privacy`
- `/terms`
- `/support`

## No viewer behavior changed

The stream builder, Twitch players, chat, audio focus, favorites, layouts, ads, analytics, and install behavior were not redesigned as part of this pass.

## Test locally

```bash
npm install
npm run build
npm run dev
```

Then open:

- `/`
- `/about`
- `/support`
- `/privacy`
- `/terms`

## Deploy

After reviewing locally:

```bash
git add src public ADSENSE-MINIMUM-PASS.md
git commit -m "Add AdSense approval content pages"
git push origin main
npm run deploy
```

After the deployed pages are live and confirmed, return to AdSense and resubmit the application.
