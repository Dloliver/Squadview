# SquadView static Google tag fix

This moves the standard GA4 tag for `G-25Q1MYPG8Q` into the static `<head>` so Google Tag Diagnostics can detect it.

It also updates the analytics helper so it does **not** load or configure GA4 a second time. Custom SquadView events continue using the existing `gtag()` function.

## Apply

```bash
cd "/Users/dennisoliver/Dev/SquadView/Squadview"

rm -rf /tmp/SquadView-static-Google-tag
unzip -o ~/Downloads/SquadView-static-Google-tag.zip -d /tmp/SquadView-static-Google-tag

cp -R /tmp/SquadView-static-Google-tag/SquadView-static-Google-tag/. .
```

## Verify before deployment

```bash
grep -n -A8 -B2 "G-25Q1MYPG8Q" index.html
npm run build
grep -n -A8 -B2 "G-25Q1MYPG8Q" dist/index.html
```

The tag should appear once in the built HTML.

## Deploy

```bash
git add index.html src/analytics/dataLayer.js
git commit -m "Move GA4 tag into static head"
git push origin main
npm run deploy
```

After deployment, use Google Analytics **Retest**. The existing `collect` requests should continue returning `204`.
