import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');

function pass(name, condition) {
  if (!condition) {
    console.error(`FAIL  ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS  ${name}`);
}

const sharedPendingIndex = app.indexOf("if (screen === 'shared_pending') {");
const viewerIndex = app.indexOf("if (screen === 'viewer') {", sharedPendingIndex + 1);
const premiumLabelIndex = app.indexOf('const premiumAccessLabel =');
const statusIndex = app.indexOf('const stripeSubscriptionStatus =');
const dateIndex = app.indexOf('const stripeSubscriptionDate =');
const planIndex = app.indexOf('const stripePlanLabel =');
const promoIndex = app.indexOf('const promotionalPremiumActive =');
const modalUseIndex = app.indexOf('>{premiumAccessLabel}</span>');

pass('Shared-pending screen branch exists', sharedPendingIndex >= 0);
pass('Primary viewer render branch exists', viewerIndex > sharedPendingIndex);
pass('Premium billing modal uses premiumAccessLabel', modalUseIndex > viewerIndex);
pass('premiumAccessLabel is component-scoped before screen render branches', premiumLabelIndex >= 0 && premiumLabelIndex < sharedPendingIndex);
pass('Premium billing status label is component-scoped', statusIndex >= 0 && statusIndex < sharedPendingIndex);
pass('Premium billing period date is component-scoped', dateIndex >= 0 && dateIndex < sharedPendingIndex);
pass('Premium plan label is component-scoped', planIndex >= 0 && planIndex < sharedPendingIndex);
pass('Referral Premium state is component-scoped', promoIndex >= 0 && promoIndex < sharedPendingIndex);

const viewerBranchStart = viewerIndex;
const finalReturnIndex = app.indexOf('\n  return (', viewerBranchStart);
const viewerSlice = finalReturnIndex > viewerBranchStart
  ? app.slice(viewerBranchStart, finalReturnIndex)
  : app.slice(viewerBranchStart, modalUseIndex);

pass('Viewer branch no longer owns premiumAccessLabel', !viewerSlice.includes('const premiumAccessLabel ='));
pass('Viewer branch no longer owns billing display state', !viewerSlice.includes('const stripeSubscriptionStatus ='));

if (process.exitCode) process.exit(process.exitCode);
console.log('\nSquadView Phase 4.1.1 Premium Billing runtime scope verification passed.');
