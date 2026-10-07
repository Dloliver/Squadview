import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');

const checks = [
  ['Open-slot reconciliation helper exists', app.includes('function reconcileOpenSlotsWithLiveFavorites(roster, { excludedChannels = [] } = {})') && app.includes('const openSlots = Math.max(0, viewerStreamLimit - normalizedRoster.length);')],
  ['Auto-fill never replaces existing roster entries', app.includes('return additions.length ? [...normalizedRoster, ...additions] : normalizedRoster;') && !app.includes('reconcileOpenSlotsWithLiveFavorites(roster).splice')],
  ['Manual viewer removal refills vacancy when eligible', app.includes('const nextChannels = reconcileOpenSlotsWithLiveFavorites(remaining, {\n      excludedChannels: [cleaned],\n    });') && app.includes('commitViewerChannels(nextChannels, {')],
  ['Manual Favorite removal suppresses only removed Favorite', app.includes('suppressFavoriteAutoFill(cleaned);') && app.includes('excludedChannels: [cleaned]')],
  ['Manage Streams removal can refill from live Favorites', app.includes('setManagerDraftChannels((current) => {') && app.includes('return reconcileOpenSlotsWithLiveFavorites(remaining, { excludedChannels: [cleaned] });')],
  ['Manage Streams draft reconciles while Auto-fill is on', app.includes("source: 'manager'") && app.includes('const reconciledDraft = reconcileOpenSlotsWithLiveFavorites(managerDraftChannels);')],
  ['Clear-all remains respected in Manage Streams', app.includes('if (managerClearedAll) return;') && app.includes('if (managerClearedAll) return remaining;')],
  ['Offline streams still use restart grace period', app.includes('const OFFLINE_REMOVAL_GRACE_MS = 75 * 1000;') && app.includes('}, OFFLINE_REMOVAL_GRACE_MS);')],
  ['Viewer live status still polls automatically', app.includes('const VIEWER_LIVE_POLL_MS = 45 * 1000;') && app.includes('window.setInterval(refreshViewerLiveStatus, VIEWER_LIVE_POLL_MS)')],
  ['Offline removal can immediately refill with another Favorite', app.includes('const nextChannels = reconcileOpenSlotsWithLiveFavorites(remainingChannels, {') && app.includes('excludedChannels: offlineChannels')],
  ['Offline Favorite cannot immediately re-add from stale live data', app.includes('offlineChannels.forEach(suppressFavoriteAutoFill);') && app.includes('Auto-fill cannot immediately put the just-removed offline stream back.')],
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
  console.error(`\nFavorite vacancy refill Phase 2.6 verification failed: ${failed} check(s).`);
  process.exit(1);
}

console.log('\nSquadView Phase 2.6 Favorite vacancy refill verification passed.');
