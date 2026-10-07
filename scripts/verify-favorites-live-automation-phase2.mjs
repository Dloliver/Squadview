import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');

const checks = [
  ['Auto-fill Favorites preference exists and defaults off', app.includes("AUTO_FILL_FAVORITES_KEY") && app.includes("readStoredBoolean(AUTO_FILL_FAVORITES_KEY, false)")],
  ['Auto-fill is additive and never replaces a live stream', app.includes('const openSlots = Math.max(0, viewerStreamLimit - channels.length);') && app.includes('commitViewerChannels([...channels, ...additions]')],
  ['manual favorite removals suppress immediate re-add', app.includes('autoFillSuppressedFavoritesRef') && app.includes('suppressFavoriteAutoFill')],
  ['active viewer streams receive background live checks', app.includes('VIEWER_LIVE_POLL_MS') && app.includes("[SquadView active viewer live status] unavailable")],
  ['confirmed offline streams use a grace period before removal', app.includes('OFFLINE_REMOVAL_GRACE_MS') && app.includes("trackEvent('viewer_offline_streams_auto_removed'")],
  ['Favorite live checks run independently while the app is visible', app.includes('FAVORITE_LIVE_POLL_MS') && app.includes("document.visibilityState === 'visible'")],
  ['Favorite go-live alerts are available with optional sound', app.includes('favoriteLiveAlertsEnabled') && app.includes('favoriteLiveAlertSound') && app.includes('playFavoriteLiveAlertTone')],
  ['free and premium Favorite limits are defined', app.includes('FREE_FAVORITE_STREAMER_LIMIT = 8') && app.includes('PREMIUM_FAVORITE_STREAMER_LIMIT = 50')],
  ['Following owns Favorites instead of a top-level Favorites page', app.includes('Favorite or unfavorite creators here without maintaining a separate Favorites page.') && !app.includes("className={landingTab === 'favorites' ? 'is-current' : ''}")],
  ['Following has Live, Favorites, and All following subviews', app.includes('following-view-tabs') && app.includes("followingView === 'live'") && app.includes("followingView === 'favorites'") && app.includes("followingView === 'all'")],
  ['Following cards can Favorite and unfavorite creators', app.includes('following-favorite-toggle') && app.includes('toggleFavoriteStreamer(channel)')],
  ['builder exposes Auto-fill toggle', app.includes('builder-automation-toggle') && app.includes('Use open slots only. SquadView never replaces a live stream you chose.')],
  ['Manage streams exposes Auto-fill toggle', app.includes('stream-manager-automation-toggle') && app.includes('Fill open slots when a Favorite is live. Existing live streams are never replaced.')],
  ['Favorite live alert toast styling is installed', css.includes('.favorite-live-toast {') && css.includes('.favorite-live-toast-dismiss')],
  ['automation toggle styling is installed', css.includes('.automation-toggle {') && css.includes('.automation-toggle input:checked + i')],
  ['Following integrated Favorites styling is installed', css.includes('.following-view-tabs {') && css.includes('.following-directory-list {') && css.includes('.following-favorite-toggle')],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nSquadView Favorites + Live Automation Phase 2 verification failed.');
  process.exit(1);
}

console.log('\nSquadView Favorites + Live Automation Phase 2 verification passed.');
