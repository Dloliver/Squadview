import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'src/App.jsx');
const cssPath = path.join(root, 'src/styles.css');

const app = fs.readFileSync(appPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

const checks = [
  ['draft roster state', app.includes('const [managerDraftChannels, setManagerDraftChannels] = useState([]);')],
  ['original roster snapshot', app.includes('managerOriginalChannelsRef.current = currentRoster;')],
  ['draft add path', app.includes('function addChannelToManagerDraft(channel)')],
  ['draft remove path', app.includes('function removeChannelFromManagerDraft(channelToRemove)')],
  ['draft reorder path', app.includes('function moveManagerDraftChannel(channel, direction)')],
  ['draft drag path', app.includes('function dropManagerDraftChannel(targetChannel)')],
  ['draft replacement path', app.includes('function replaceChannelInManagerDraft(')],
  ['manager live status fetch', app.includes('[SquadView stream manager live status] unavailable')],
  ['remove offline action', app.includes('function removeOfflineManagerStreams()')],
  ['remove offline count', app.includes('`Remove offline · ${managerOfflineChannels.length}`')],
  ['changes apply on Done', app.includes('Changes apply when you choose Done.')],
  ['bulk ad threshold', app.includes('addedCount >= 4')],
  ['full rebuild ad rule', app.includes('retainedOriginalCount === 0')],
  ['premium ad bypass', app.includes('entitlements.squadViewAds')],
  ['draft ad launch', app.includes("kind: 'manager_draft'")],
  ['draft ad completion', app.includes("if (launch?.kind === 'manager_draft' && launch.channels?.length)")],
  ['opaque manager backdrop', css.includes('background: #020c0a;')],
  ['clear all still available', app.includes('secondary-button stream-manager-clear-all')],
  ['cancel discards draft', app.includes('function closeManageStreams()')],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}

const manageStart = app.indexOf('{showEdit && (');
const manageEnd = app.indexOf('{showClearAllConfirm && (', manageStart);
const managerRender = manageStart >= 0 && manageEnd > manageStart
  ? app.slice(manageStart, manageEnd)
  : '';

const renderChecks = [
  ['manager renders draft roster', managerRender.includes('{managerDraftChannels.map((channel, index) => (')],
  ['manager source Add writes draft', managerRender.includes('onClick={() => addChannelToManagerDraft(channel)}')],
  ['manager X removes from draft', managerRender.includes('onClick={() => removeChannelFromManagerDraft(channel)}')],
  ['manager backdrop cancels draft', managerRender.includes('onClick={closeManageStreams}')],
  ['Done disabled at zero', managerRender.includes('disabled={!managerDraftChannels.length}')],
];

for (const [label, ok] of renderChecks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}

if (app.includes('managerRebuildPending')) {
  console.log('FAIL  old immediate rebuild state removed');
  failed = true;
} else {
  console.log('PASS  old immediate rebuild state removed');
}

if (failed) {
  console.log('\nManage Streams draft/offline verification found a problem.');
  process.exitCode = 1;
} else {
  console.log('\nManage Streams draft/offline verification passed.');
}
