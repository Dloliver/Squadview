import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'src', 'App.jsx');
const stylesPath = path.join(root, 'src', 'styles.css');

const app = fs.readFileSync(appPath, 'utf8');
const styles = fs.readFileSync(stylesPath, 'utf8');

const checks = [
  ['builder clear handler exists', app.includes('function clearAllBuildStreams()')],
  ['builder clear empties all plan slots', app.includes('setInputs(padViewerInputs([], viewerStreamLimit));')],
  ['builder clear clears remembered roster', app.includes('saveLastChannels([]);')],
  ['manager clear handler exists', app.includes('function clearAllViewerStreams()')],
  ['manager clear confirmation exists', app.includes("window.confirm('Clear all streams from this SquadView?')")],
  ['manager clear uses current zero-roster path', app.includes('commitViewerChannels([]);')],
  ['empty viewer uses plan-aware input padding', app.includes('setInputs(padViewerInputs([], viewerStreamLimit));') && !app.includes("setInputs(['', '', '', '', '', '', '', '']);")],
  ['builder Clear all button wired', app.includes('className="secondary-button builder-clear-all-button"') && app.includes('onClick={clearAllBuildStreams}')],
  ['manager Clear all button wired', app.includes('className="secondary-button stream-manager-clear-all"') && app.includes('onClick={clearAllViewerStreams}')],
  ['manager footer action group exists', app.includes('className="stream-manager-footer-actions"')],
  ['builder actions are side by side', styles.includes('.builder-quick-watch-dock {') && styles.includes('gap: 10px;')],
  ['builder clear button styled', styles.includes('.builder-quick-watch-dock .builder-clear-all-button')],
  ['manager clear actions styled', styles.includes('.stream-manager-footer-actions') && styles.includes('.stream-manager-clear-all')],
];

let failed = 0;
console.log('======================================================');
console.log(' SQUADVIEW CLEAR ALL STREAMS VERIFICATION');
console.log('======================================================');
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) failed += 1;
}
console.log('------------------------------------------------------');
console.log(failed ? `${failed} check(s) failed.` : 'All clear-all-stream checks passed.');
console.log('======================================================');
process.exitCode = failed ? 1 : 0;
