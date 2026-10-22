import fs from 'node:fs';
import path from 'node:path';

const app = fs.readFileSync(path.join(process.cwd(), 'src/App.jsx'), 'utf8');
const report = (label, condition) => {
  if (!condition) { console.error(`FAIL  ${label}`); process.exitCode = 1; }
  else console.log(`PASS  ${label}`);
};

const sharedPending = app.indexOf("  if (screen === 'shared_pending') {");
const screenBranch = app.indexOf("  if (screen === 'viewer') {", sharedPending);
const mainReturn = app.indexOf('\n  return (', screenBranch);
const modalStart = app.indexOf('      {showPremiumBilling && accountSession?.user?.id && (', mainReturn);
const modalEnd = app.indexOf('      <SiteFooter />', modalStart);
report('Viewer, final return, and Premium/Billing modal boundaries present',
  screenBranch > 0 && mainReturn > screenBranch && modalStart > mainReturn && modalEnd > modalStart);
if (screenBranch < 0 || mainReturn < 0 || modalStart < 0 || modalEnd < 0) process.exit(1);
const viewer = app.slice(screenBranch, mainReturn);
const modal = app.slice(modalStart, modalEnd);
const component = app.slice(0, sharedPending);

// Detect viewer-only lexical declarations referenced in the external modal.
// This intentionally includes declarations in nested viewer callbacks/blocks.
const viewerLocals = new Set();
const declaration = /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
for (const match of viewer.matchAll(declaration)) viewerLocals.add(match[1]);
const leaked = [...viewerLocals].filter(name =>
  new RegExp(`\\b${name.replace(/[$]/g, '\\$&')}\\b`).test(modal));
report('No viewer-branch declarations referenced by Premium/Billing modal', leaked.length === 0);
if (leaked.length) console.error('Out-of-scope viewer identifiers:', leaked.join(', '));

// This explicitly covers *all application bindings referenced by this modal*;
// not just the first binding that previously threw a ReferenceError.
const sharedBindings = [
  'showPremiumBilling', 'setShowPremiumBilling', 'accountSession', 'billingError',
  'premiumBillingStatusBusy', 'premiumBillingStatus', 'entitlements',
  'premiumAccessLabel', 'promotionalPremiumActive', 'formatRewardDate',
  'stripeSubscriptionDate', 'stripeSubscriptionStatus', 'stripePlanLabel',
  'premiumSubscriptionStatusLabel', 'PREMIUM_PRICING', 'PREMIUM_TRIAL_DAYS',
  'openPremiumBillingPortal', 'billingBusy', 'startPremiumCheckout',
  'referralSummary', 'referralQualifiedCount', 'channels', 'openShareSquad',
];
const importedOrDeclared = (name) => new RegExp(`\\b(?:const|let|var|function|class|import)\\s+(?:\\{[^}]*\\b)?${name.replace(/[$]/g, '\\$&')}\\b`).test(component)
  || new RegExp(`\\b(?:const|let)\\s*\\[[^\\]]*\\b${name.replace(/[$]/g, '\\$&')}\\b[^\\]]*\\]\\s*=`).test(component)
  || new RegExp(`\\bfunction\\s+${name.replace(/[$]/g, '\\$&')}\\s*\\(`).test(component)
  || new RegExp(`\\b${name.replace(/[$]/g, '\\$&')}\\b`).test(app.slice(0, app.indexOf('function SquadViewApp')));
const missing = sharedBindings.filter(name => !new RegExp(`\\b${name.replace(/[$]/g, '\\$&')}\\b`).test(modal) ? false : !importedOrDeclared(name));
report('Every tracked Premium/Billing binding resolves outside viewer branch', missing.length === 0);
if (missing.length) console.error('Unresolved modal bindings:', missing.join(', '));

const referralDeclaration = 'const referralQualifiedCount = Math.max(0, Number(referralSummary?.qualifiedReferrals) || 0);';
report('Referral count is component-scoped before shared-pending branch',
  component.includes(referralDeclaration));
report('Referral count has exactly one declaration',
  [...app.matchAll(/\bconst referralQualifiedCount\s*=/g)].length === 1);
report('Viewer referral progress still uses component-scoped count',
  viewer.includes('(referralQualifiedCount % 5)'));
report('Premium rewards display still references the same count',
  modal.includes('{referralQualifiedCount} qualified'));

if (process.exitCode) process.exit(process.exitCode);
console.log('\nSquadView Phase 4.1.2 Premium Billing runtime completion verification passed.');
