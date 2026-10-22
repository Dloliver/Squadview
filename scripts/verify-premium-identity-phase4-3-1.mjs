import fs from 'node:fs';
const app = fs.readFileSync('src/App.jsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
const tests = [
  ['Premium derived from server-owned entitlements', app.includes('const premiumIdentityBadgeLabel = entitlements.lifetimePremium') && app.includes(': entitlements.isPremium')],
  ['Lifetime distinct from standard and referral', app.includes('const premiumIdentityBadgeClass = entitlements.lifetimePremium') && app.includes("? 'is-lifetime'")],
  ['Both desktop and mobile badges entitlement-gated', (app.match(/accountSession && entitlements\.isPremium && \(/g) || []).length >= 2],
  ['Desktop badge uses current labeled header', app.includes('premium-identity-badge is-header') && app.includes("entitlements.lifetimePremium ? 'Lifetime' : promotionalPremiumActive ? 'Referral' : 'Premium'")],
  ['Mobile badge anchors to avatar', app.includes('premium-identity-badge is-mobile') && css.includes('.account-button .premium-identity-badge.is-mobile {')],
  ['Badge style for header and mobile', css.includes('.premium-identity-badge.is-header {') && css.includes('.premium-identity-badge.is-mobile { display: none; }')],
  ['Modal retains entitlement identity', app.includes('className="account-profile-name-row"') && app.includes('className={`premium-identity-badge ${premiumIdentityBadgeClass}`}')],
  ['Lifetime appearance retained', css.includes('.premium-identity-badge.is-lifetime {') && css.includes('.premium-identity-badge.is-lifetime .premium-identity-symbol {')],
  ['Account name truncation retained', css.includes('.account-button-display-name {') && css.includes('text-overflow: ellipsis;')],
  ['Mobile account label hidden', css.includes('.account-button > span:last-child') && css.includes('display: none;')],
];
let failed=0;
for(const [name,ok] of tests) { console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed++; }
console.log(`Phase 4.3.1 verification: ${tests.length-failed}/${tests.length} checks passed.`);
if(failed) process.exit(1);
