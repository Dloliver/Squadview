import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');

const checks = [
  ['Manage streams current lineup can toggle Favorites', app.includes('stream-manager-row-actions') && app.includes('stream-manager-favorite-toggle') && app.includes('toggleFavoriteStreamer(channel)')],
  ['Manage streams source rows expose Favorite controls', app.includes('stream-manager-source-actions') && app.includes('stream-manager-add-button')],
  ['Manage Favorites source can unfavorite directly', app.includes('className="stream-manager-favorite-toggle is-favorite"') && app.includes('title="Remove from Favorites"')],
  ['Build page no longer has a Favorites source mode', !app.includes('builder-source-toggle') && !app.includes("builderMode === 'favorites'") && !app.includes("setBuilderMode('favorites')")],
  ['Build entries can toggle Favorite state inline', app.includes('builder-favorite-toggle') && app.includes('toggleFavoriteStreamer(cleanChannel(value))')],
  ['Build page keeps progressive stream entry behavior', app.includes('inputs.slice(0, manualBuilderInputCount).map((value, index) => (')],
  ['Redundant home Favorite shortcuts panel is removed', !app.includes('<span>Your shortcuts</span>') && !app.includes('No favorites are live right now')],
  ['Following remains the consolidated Favorite discovery surface', app.includes('Live Favorites rise to the top automatically.') && app.includes('following-favorite-toggle')],
  ['Favorite action styling is installed for manager and builder', css.includes('.builder-favorite-toggle,') && css.includes('.stream-manager-favorite-toggle') && css.includes('.stream-manager-source-actions')],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nSquadView Favorites Access Cleanup Phase 2.1 verification failed.');
  process.exit(1);
}

console.log('\nSquadView Favorites Access Cleanup Phase 2.1 verification passed.');
