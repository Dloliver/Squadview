import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const checks = [
  ['known live fallback', 'const managerKnownLiveChannels = useMemo(() => {'],
  ['Following Live feeds manager live state', 'followedLiveLogins.forEach((channel) => live.add(channel));'],
  ['favorite live feeds manager live state', 'liveFavoriteStreamers.forEach((channel) => live.add(channel));'],
  ['known followed offline fallback', 'followedStatusReady && followedChannelLogins.has(channel)'],
  ['unknown channel protection', 'const managerUnknownChannels = useMemo(() => {'],
  ['remove offline works without generic API', 'if (!managerOfflineChannels.length) return;'],
  ['safe unknown footer copy', "? 'No confirmed offline'"],
  ['row live state uses known live set', 'managerKnownLiveChannels.has(channel) && <><i className="live-dot"'],
];

let failed = false;
for (const [label, marker] of checks) {
  const ok = app.includes(marker);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}

const forbidden = [
  "disabled={managerLiveStatus !== 'ready' || !managerOfflineChannels.length}",
  "'Offline check unavailable'",
  "'Live status unavailable'",
];
for (const marker of forbidden) {
  const ok = !app.includes(marker);
  console.log(`${ok ? 'PASS' : 'FAIL'}  removed stale unavailable-only path: ${marker}`);
  if (!ok) failed = true;
}

if (failed) process.exitCode = 1;
