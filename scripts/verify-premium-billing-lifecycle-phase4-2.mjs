import fs from 'node:fs';
import assert from 'node:assert/strict';
const app = fs.readFileSync('src/App.jsx', 'utf8');
const billing = fs.readFileSync('src/services/billingService.js', 'utf8');
const webhook = fs.readFileSync('supabase/functions/stripe-webhook/index.ts', 'utf8');
const functionSource = fs.readFileSync('supabase/functions/squadview-billing/index.ts', 'utf8');
const checks = [
  ['Cancellation is read from billing status', /cancelAtPeriodEnd:\s*Boolean\(data\.cancelAtPeriodEnd\s*\|\|\s*data\.cancelAt\)/.test(billing)],
  ['Billing backend returns cancellation flag', /cancelAtPeriodEnd:\s*Boolean\(current\?\.cancel_at_period_end\s*\|\|\s*current\?\.cancel_at\)/.test(functionSource)],
  ['Webhook persists cancellation flag', /cancel_at_period_end:\s*Boolean\(subscription\?\.cancel_at_period_end\s*\|\|\s*subscription\?\.cancel_at\)/.test(webhook)],
  ['Billing modal detects cancellation', /premiumBillingStatus\.cancelAtPeriodEnd/.test(app)],
  ['Billing access remains until cancellation date', /subscription stays Premium through/.test(app)],
  ['Cancellation notice distinguishes trialing', /stripeSubscriptionStatus === 'trialing' \? 'Your trial will not convert/.test(app)],
  ['Status refreshes on browser focus', /window\.addEventListener\('focus', refreshOnFocus\)/.test(app)],
  ['Status refreshes on restored page', /window\.addEventListener\('pageshow', refreshOnPageShow\)/.test(app)],
  ['Status refreshes on tab visibility', /document\.addEventListener\('visibilitychange', refreshOnFocus\)/.test(app)],
  ['Focus listeners cleaned up', /window\.removeEventListener\('focus', refreshOnFocus\)/.test(app)],
  ['Page show listeners cleaned up', /window\.removeEventListener\('pageshow', refreshOnPageShow\)/.test(app)],
  ['Visibility listeners cleaned up', /document\.removeEventListener\('visibilitychange', refreshOnFocus\)/.test(app)],
  ['No Stripe portal for lifetime entitlement', /entitlements\.lifetimePremium \? \(/.test(app)],
  ['No Stripe portal for promotional entitlement', /promotionalPremiumActive \? \(/.test(app)],
  ['Webhook syncs entitlements separately', /await syncEntitlements\(admin, userId\)/.test(webhook)],
  ['Webhook does not directly reset lifetime field', !/lifetime_premium\s*:/.test(webhook)],
  ['Webhook does not directly reset referral expiry', !/promo_premium_until\s*:/.test(webhook)],
];
let failures = 0;
for (const [name, ok] of checks) {
 console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
 if (!ok) failures++;
}
if (failures) { console.error(`Failed checks: ${failures}`); process.exit(1); }
console.log('Phase 4.2 billing lifecycle static checks passed. Live database and Stripe behavior require manual QA.');
