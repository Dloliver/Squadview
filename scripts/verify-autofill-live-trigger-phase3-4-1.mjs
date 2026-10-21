import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');

const checks = [
  ['Auto-fill viewer backup refresh exists', /Auto-fill needs a fresh positive Twitch signal while the viewer is already/],
  ['Backup refresh only runs inside the viewer', /screen !== 'viewer' \|\|[\s\S]{0,180}!autoFillFavorites/],
  ['Backup refresh requires Auto-fill enabled', /!autoFillFavorites \|\|/],
  ['Backup refresh requires a signed-in Twitch account', /!accountSession\?\.user\?\.id \|\|/],
  ['Backup refresh is scoped to users with Favorites', /!favoriteStreamers\.length/],
  ['Followed Live refresh is silent', /void refreshFollowedLiveStreams\(\{ silent: true \}\);/],
  ['Followed Live refresh happens immediately when eligible', /refreshAutoFillFollowing\(\);\s*const interval/],
  ['Followed Live refresh repeats on the Favorite poll cadence', /setInterval\(refreshAutoFillFollowing, FAVORITE_LIVE_POLL_MS\)/],
  ['Returning to a visible tab refreshes Auto-fill status', /document\.visibilityState === 'visible'\) refreshAutoFillFollowing\(\)/],
  ['Existing viewer Auto-fill reconciliation remains active', /source: 'viewer'[\s\S]{0,500}favorite_auto_fill_applied|favorite_auto_fill_applied[\s\S]{0,500}source: 'viewer'/],
  ['Manage Streams still has its explicit Followed Live refresh', /openEditGroup[\s\S]{0,1200}refreshFollowedLiveStreams\(\{ silent: true \}\)/],
];

let failed = false;
for (const [label, pattern] of checks) {
  if (pattern.test(app)) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('\nSquadView Phase 3.4.1 Auto-fill Live Trigger verification passed.');
