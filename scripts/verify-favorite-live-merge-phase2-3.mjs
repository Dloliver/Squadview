import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const followingService = fs.readFileSync(path.join(root, 'src/services/twitchFollowingService.js'), 'utf8');
const twitchAccount = fs.readFileSync(path.join(root, 'supabase/functions/twitch-account/index.ts'), 'utf8');

const count = (text, fragment) => text.split(fragment).length - 1;

const checks = [
  ['positive live sources are merged for Favorites', app.includes('const knownLiveFavoriteLogins = useMemo(() => {') && app.includes('Neither\n    // source is allowed to hide a creator that the other source confirms live.')],
  ['Twitch followed-live cards are never subtracted by Favorite polling', !app.includes("if (favoriteSet.has(login) && favoriteLiveStatusReady && !liveFavoriteStreamers.has(login)) return;")],
  ['Favorite-only polling is additive to Following Live', app.includes('The Favorites-only poll is additive.') && app.includes('knownLiveFavoriteLogins.forEach((login) => {')],
  ['non-followed live Favorites can still receive a lightweight card', app.includes("user_name: followed?.broadcaster_name || login") && !app.includes('if (!followed) return;\n      streamByLogin.set(login, {')],
  ['Favorite ordering uses the merged live set', app.includes('Number(knownLiveFavoriteLogins.has(second)) - Number(knownLiveFavoriteLogins.has(first))')],
  ['Following waits briefly for Favorite status before final render', app.includes("followingStatus === 'loading' || (favoriteStreamers.length > 0 && !favoriteLiveStatusReady)")],
  ['missing optional live-status endpoint cannot leave readiness stuck false', app.includes('setFavoriteLiveStatusReady(true);\n      return undefined;')],
  ['active client imports one Following service', count(app, "from './services/twitchFollowingService'") === 1],
  ['active client service exports one followed-live loader', count(followingService, 'export async function loadFollowedLiveStreams()') === 1],
  ['backend has one followed-live action handler', count(twitchAccount, "if (action === 'followed-live')") === 1],
  ['backend has one followed-live server loader', count(twitchAccount, 'async function loadFollowedLiveStreamsServer(') === 1],
  ['backend has one followed-channels action handler', count(twitchAccount, "if (action === 'followed-channels')") === 1],
];

let failed = false;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed = true;
}

if (failed) {
  console.error('\nSquadView Favorite Live Merge Phase 2.3 verification failed.');
  process.exit(1);
}

console.log('\nSquadView Favorite Live Merge Phase 2.3 verification passed.');
