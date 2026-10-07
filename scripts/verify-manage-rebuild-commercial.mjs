import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'src', 'App.jsx');
const cssPath = path.join(root, 'src', 'styles.css');

const app = fs.readFileSync(appPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

const checks = [
  ['rebuild state', app.includes('const [managerRebuildPending, setManagerRebuildPending] = useState(false);')],
  ['clear keeps manager open', app.includes("commitViewerChannels([], { keepManagerOpen: true });")],
  ['empty commit option', app.includes('keepManagerOpen = false,')],
  ['manager remains open on clear', app.includes('if (keepManagerOpen) {\n        setShowEdit(true);\n        return;\n      }')],
  ['rebuild ad source', app.includes("source: 'manager_rebuild'")],
  ['rebuild uses existing viewer return path', app.includes("kind: 'existing_viewer'")],
  ['rebuild ad respects SquadView ad entitlement', app.includes('&& entitlements.squadViewAds')],
  ['rebuild ad requires configured loading ad', app.includes('&& isLoadingAdConfigured()')],
  ['manager close uses rebuild finish flow', app.includes('className="stream-manager-close" onClick={finishManageStreams}')],
  ['manager backdrop uses rebuild finish flow', app.includes('className="stream-manager-backdrop" onClick={finishManageStreams}')],
  ['empty manager state', app.includes('className="stream-manager-current-empty"')],
  ['done disabled when empty', app.includes('onClick={finishManageStreams}\n                    disabled={!channels.length}')],
  ['clear disabled when empty', app.includes('onClick={clearAllViewerStreams}\n                    disabled={!channels.length}')],
  ['confirmation copy keeps manager open', app.includes('Manage Streams will stay open so you can build a fresh lineup.')],
  ['browser confirm removed', !app.includes("window.confirm('Clear all streams from this SquadView?')")],
  ['ad finish returns existing viewer', app.includes("if (launch?.kind === 'existing_viewer') {\n      setScreen('viewer');")],
  ['empty state styles', css.includes('/* Manage Streams rebuild flow */') && css.includes('.stream-manager-current-empty')],
  ['custom clear modal preserved', css.includes('/* Clear all streams confirmation */') && app.includes('className="modal clear-all-confirm-modal"')],
];

let failed = 0;
for (const [label, ok] of checks) {
  if (ok) console.log(`PASS: ${label}`);
  else {
    failed += 1;
    console.log(`FAIL: ${label}`);
  }
}

console.log('');
if (failed) {
  console.log(`${failed} verification check${failed === 1 ? '' : 's'} failed.`);
  process.exitCode = 1;
} else {
  console.log('Manage Streams rebuild + commercial verification passed.');
  console.log('No database migration is required.');
}
