import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const twitchPlayer = fs.readFileSync(path.join(root, 'src/components/TwitchPlayer.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');

const checks = [
  ['Following Live cards retain favorite state class', app.includes("following-live-card ${isFavorite ? 'is-favorite' : ''}")],
  ['All Following rows receive favorite state class', app.includes("${isFavorite ? 'is-favorite' : ''} ${isLive ? 'is-live' : ''}")],
  ['Favorites directory rows are explicitly favorite styled', app.includes("className={`is-favorite ${isLive ? 'is-live' : ''}`}")],
  ['Manage current rows receive favorite and live state classes', app.includes("stream-manager-current-row ${favoriteStreamers.includes(channel) ? 'is-favorite' : ''} ${managerKnownLiveChannels.has(channel) ? 'is-live' : ''}")],
  ['Manage Following Live rows receive favorite state class', app.includes("stream-manager-source-row is-live ${favoriteStreamers.includes(channel) ? 'is-favorite' : ''}")],
  ['Manage Favorites rows are explicitly favorite styled', app.includes("stream-manager-source-row is-favorite ${isLive ? 'is-live' : ''}")],
  ['Progressive builder rows receive favorite state class', app.includes("className={favoriteStreamers.includes(cleanChannel(value)) ? 'is-favorite' : ''}")],
  ['Viewer cards receive favorite state class', twitchPlayer.includes("${isFavorite ? 'is-favorite' : ''} ${chatCovered ? 'is-chat-covered' : ''}")],
  ['Favorite palette variables installed', css.includes('--favorite: #ffbd45;') && css.includes('--favorite-soft: #ffe09a;')],
  ['Favorite live cards use strong border and glow', css.includes('.following-live-card.is-favorite {') && css.includes('animation: squadviewFavoriteGlow')],
  ['Manage favorite rows use gold treatment', css.includes('.stream-manager-current-row.is-favorite,') && css.includes('.stream-manager-source-row.is-favorite {')],
  ['Builder favorite rows use gold treatment', css.includes('.channel-list label.is-favorite {')],
  ['Viewer favorite cards use gold halo', css.includes('.stream-card.is-favorite {')],
  ['Active viewer state preserves mint focus treatment', css.includes('.stream-card.is-favorite.is-active {') && css.includes('border-color: var(--mint);')],
  ['Reduced motion disables favorite animation', css.includes('@media (prefers-reduced-motion: reduce)') && css.includes('.following-live-card.is-favorite { animation: none; }')],
  ['Mobile favorite cards disable animation', css.includes('@media (max-width: 760px)') && css.includes('box-shadow: 0 0 0 1px rgba(255,189,69,.28)')],
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
  console.error(`\nFavorite visual priority verification failed: ${failed} check(s).`);
  process.exit(1);
}

console.log('\nSquadView Phase 2.4 favorite visual priority verification passed.');
