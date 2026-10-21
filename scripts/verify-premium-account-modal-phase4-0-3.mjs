import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const styles = fs.readFileSync('src/styles.css', 'utf8');

const checks = [
  ['Signed-in account modal keeps its dedicated responsive layout class', app.includes("account-modal ${accountSession ? 'is-signed-in' : ''}")],
  ['Desktop account modal expands to 760px', styles.includes('width: min(760px, calc(100vw - 32px));')],
  ['Account modal is capped to the viewport and scrollable', styles.includes('max-height: calc(100dvh - 32px);') && styles.includes('overflow-y: auto;')],
  ['Signed-in desktop account modal uses two columns', styles.includes('grid-template-columns: repeat(2, minmax(0, 1fr));')],
  ['Mobile account modal returns to one column', styles.includes('@media (max-width: 760px)') && styles.includes('grid-template-columns: 1fr;')],
  ['Account modal now delegates Premium management to a dedicated workspace', app.includes("openPremiumBillingDetails('account')") && app.includes('View Premium plans') && app.includes('Premium & Billing')],
  ['Rewards remain compact metrics', app.includes('account-rewards-metrics') && app.includes('<span>30 days Premium</span>') && app.includes('<span>Lifetime Premium</span>')],
  ['Empty SquadView still avoids a disabled share-rewards button', app.includes('channels.length > 0 && (') && app.includes('Share current SquadView')],
  ['Sync copy remains compact', app.includes('Favorites and your latest lineup follow this account across devices.')],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nSquadView Phase 4.0.3 Account Modal regression verification failed.');
  process.exit(1);
}

console.log('\nSquadView Phase 4.0.3 Account Modal regression verification passed.');
