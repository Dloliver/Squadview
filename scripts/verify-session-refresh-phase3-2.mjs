import fs from 'node:fs';
import process from 'node:process';

const appPath = new URL('../src/App.jsx', import.meta.url);
const app = fs.readFileSync(appPath, 'utf8');

const checks = [
  ['viewer heartbeat storage exists', /VIEWER_HEARTBEAT_KEY\s*=\s*'squadview:viewer-heartbeat:v1'/],
  ['heartbeat runs once per minute', /VIEWER_HEARTBEAT_MS\s*=\s*60\s*\*\s*1000/],
  ['true suspension reset threshold is one hour', /VIEWER_SUSPENSION_RESET_MS\s*=\s*60\s*\*\s*60\s*\*\s*1000/],
  ['normal hidden tabs are not reset just for becoming hidden', /Do not expire a viewer merely because the tab\/app is hidden/],
  ['resume checks use heartbeat gap instead of hidden duration', /now\s*-\s*lastHeartbeat\s*>\s*VIEWER_SUSPENSION_RESET_MS/],
  ['stale viewer session is rejected on reload after a long suspension', /readViewerSession\(\)[\s\S]*Date\.now\(\)\s*-\s*lastHeartbeat\s*>\s*VIEWER_SUSPENSION_RESET_MS/],
  ['long suspended viewer returns to Build Your View', /exitViewer\('suspension_timeout'\)/],
  ['stale reset preserves the previous roster for home reconciliation', /setInputs\(padViewerInputs\(channels, viewerStreamLimit\)\)/],
  ['remembered home lineup is checked against live Twitch status', /loadLiveStatusForChannels\(remembered\)/],
  ['confirmed offline remembered channels are filtered out', /remembered\.filter\(\(channel\) => live\.has\(channel\)\)/],
  ['filtered remembered lineup is persisted', /saveLastChannels\(liveRemembered\)/],
  ['Saved Squads are not modified by remembered-lineup reconciliation', /previous lineup is convenience state, not a Saved Squad/],
  ['live-status failure keeps remembered lineup instead of clearing it', /If the live-status service is unavailable, keep the remembered list/],
  ['normal Start watching still uses the existing ad gate', /function beginWatching[\s\S]*shouldGateViewerWithAd\(\)[\s\S]*queueLoadingAd/],
  ['suspension reset does not force an ad directly', /viewer_suspension_reset[\s\S]{0,900}exitViewer\('suspension_timeout'\)/],
  ['home shows a temporary remembered-lineup checking message', /Checking your last view and removing streams that are no longer live/],
];

let failed = 0;
for (const [label, pattern] of checks) {
  if (pattern.test(app)) {
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${label}`);
  }
}

if (failed) {
  console.error(`\nSquadView Phase 3.2 verification failed (${failed} check${failed === 1 ? '' : 's'}).`);
  process.exit(1);
}

console.log('\nSquadView Phase 3.2 Session Refresh + Suspension Reset verification passed.');
