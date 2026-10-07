import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');

const checks = [
  ['Following Live keeps Favorites in the live list', app.includes('Live Favorites always stay inside Live now / Following Live')],
  ['Following Live sorts Favorites before non-Favorites', app.includes('if (firstIsFavorite !== secondIsFavorite) return firstIsFavorite ? -1 : 1;')],
  ['Favorite order is preserved inside the priority group', app.includes('favoriteRank.get(firstLogin)') && app.includes('favoriteRank.get(secondLogin)')],
  ['non-Favorites preserve Twitch live-list order', app.includes('followedRank.get(firstLogin)') && app.includes('followedRank.get(secondLogin)')],
  ['favoriting a currently live channel promotes it immediately', app.includes('else if (followedLiveLogins.has(cleaned))') && app.includes('nextLive.add(cleaned);')],
  ['unfavoriting immediately clears Favorite live priority state', app.includes('if (alreadyFavorite) {') && app.includes('nextLive.delete(cleaned);')],
  ['main Live now renders the shared priority list', (app.match(/orderedFollowedLiveStreams\.map\(\(stream\)/g) || []).length >= 2],
  ['Manage streams Following search prioritizes Favorites', app.includes('const favoriteDifference =') && app.includes('return favoriteDifference || liveDifference ||')],
];

let failed = false;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed = true;
}

if (failed) {
  console.error('\nSquadView Favorite Priority Phase 2.2 verification failed.');
  process.exit(1);
}

console.log('\nSquadView Favorite Priority Phase 2.2 verification passed.');
