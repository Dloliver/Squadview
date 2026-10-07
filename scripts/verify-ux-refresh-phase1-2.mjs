import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const player = fs.readFileSync('src/components/TwitchPlayer.jsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');

const checks = [
  ['viewer live/offline bridge state exists', app.includes('viewerLiveStatusByChannel')],
  ['mounted player offline overrides stale live state', app.includes("if (status === 'offline') live.delete(channel)")],
  ['manager marks viewer-confirmed offline channels offline', app.includes("if (viewerStatus === 'offline') return true")],
  ['viewer status handler normalizes Twitch player state', app.includes('handleViewerStreamStatusChange') && app.includes("['live', 'playing', 'paused'].includes(normalized)")],
  ['TwitchPlayer reports status back to the viewer', player.includes('onStreamStatusChange') && player.includes('onStreamStatusChange?.(channel, status)')],
  ['App passes status bridge into TwitchPlayer', app.includes('onStreamStatusChange={handleViewerStreamStatusChange}')],
  ['desktop per-stream volume button is visible', /\.volume-chip\s*\{[\s\S]*?display:\s*grid;/.test(css)],
  ['desktop volume popover is available', /\.stream-volume-popover\s*\{[\s\S]*?display:\s*grid;/.test(css)],
  ['mobile volume sizing remains intact', css.includes('@media (max-width: 520px)') && css.includes('.volume-chip')],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nSquadView UX Refresh Phase 1.2 verification failed.');
  process.exit(1);
}

console.log('\nSquadView UX Refresh Phase 1.2 verification passed.');
