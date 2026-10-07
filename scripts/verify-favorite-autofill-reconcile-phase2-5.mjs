import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');

const checks = [
  ['Auto-fill reconciles against merged live Favorite status', app.includes('if (!autoFillFavorites || !favoriteLiveStatusReady || !knownLiveFavoriteLogins.size) return;') && app.includes('(streamer) => knownLiveFavoriteLogins.has(streamer) && !autoFillSuppressedFavoritesRef.current.has(streamer)')],
  ['Following refreshes can trigger Auto-fill reconciliation', app.includes('knownLiveFavoriteLogins,\n    favoriteStreamers,\n    screen,\n    channels,')],
  ['Auto-fill remains open-slot-only and non-destructive', app.includes('const openSlots = Math.max(0, viewerStreamLimit - channels.length);') && app.includes('const additions = missing.slice(0, openSlots);') && app.includes('commitViewerChannels([...channels, ...additions]')],
  ['Manual-removal suppression resets only after merged live status clears', app.includes('if (!knownLiveFavoriteLogins.has(streamer)) {\n        autoFillSuppressedFavoritesRef.current.delete(streamer);')],
  ['Supplemental Favorite poll no longer clears suppression by itself', !app.includes('if (!nextLive.has(streamer)) autoFillSuppressedFavoritesRef.current.delete(streamer);')],
  ['Auto-fill reconciliation documents load, refresh, toggle, and open-slot triggers', app.includes('whenever the app loads, Twitch Following refreshes, Favorite') && app.includes('status refreshes, Auto-fill is enabled, or a slot opens.')],
  ['Manager still exposes Auto-fill preference', app.includes('Auto-fill live Favorites') && app.includes('Existing live streams are never replaced.')],
  ['Builder still exposes Auto-fill preference', app.includes('Use open slots only. SquadView never replaces a live stream you chose.')],
];

let failed = 0;
for (const [label, pass] of checks) {
  if (pass) console.log(`PASS  ${label}`);
  else {
    console.log(`FAIL  ${label}`);
    failed += 1;
  }
}

if (failed) {
  console.error(`\nFavorite Auto-fill reconcile Phase 2.5 verification failed: ${failed} check(s).`);
  process.exit(1);
}

console.log('\nSquadView Phase 2.5 Favorite Auto-fill reconciliation verification passed.');
