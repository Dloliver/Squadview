import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const styles = fs.readFileSync('src/styles.css', 'utf8');
const service = fs.readFileSync('src/services/billingService.js', 'utf8');
const edge = fs.readFileSync('supabase/functions/squadview-billing/index.ts', 'utf8');

const checks = [
  ['Dedicated Premium & Billing modal state exists', app.includes('showPremiumBilling') && app.includes('premiumBillingStatus')],
  ['Account opens dedicated Premium & Billing workspace', app.includes("openPremiumBillingDetails('account')")],
  ['Viewer promo rail opens dedicated Premium workspace', app.includes("openPremiumBillingDetails('viewer_rail')")],
  ['Free users get monthly and annual purchase options in the dedicated modal', app.includes("startPremiumCheckout('monthly', 'premium_modal')") && app.includes("startPremiumCheckout('annual', 'premium_modal')")],
  ['Billing status is refreshed when the Premium modal opens', app.includes('loadPremiumBillingStatus()') && app.includes('setPremiumBillingStatus(status)')],
  ['Billing return refreshes both entitlements and billing status', app.includes('Promise.all([') && app.includes('setPremiumBillingStatus(billingStatus)')],
  ['Trial end/current period date is surfaced', app.includes('Trial ends') && app.includes('Current period ends') && app.includes('currentPeriodEnd')],
  ['Cancel-at-period-end is surfaced without removing Premium early', app.includes('Cancellation scheduled') && app.includes('Premium stays active until')],
  ['Portal CTA can undo a scheduled cancellation', app.includes('Manage or undo cancellation')],
  ['Referral Premium is presented as non-Stripe access', app.includes('Premium earned through SquadView Rewards') && app.includes('there is no billing portal to manage')],
  ['Lifetime Premium is presented as non-Stripe access', app.includes('Lifetime Premium is already unlocked') && app.includes('There is no Stripe subscription to manage')],
  ['Backend exposes an authenticated get_status action', edge.includes("action === 'get_status'") && edge.includes('readPremiumBillingStatus')],
  ['Billing status is environment-scoped', edge.includes(".eq('provider', stripeProvider())") && edge.includes("environment: stripeProvider() === 'stripe_live' ? 'live' : 'test'")],
  ['Billing status returns trial eligibility from subscription history', edge.includes('trialEligible: rows.length === 0')],
  ['Portal no longer creates an empty Stripe customer for reward-only Premium', edge.includes('findExistingCustomer') && edge.includes("'no_paid_subscription'")],
  ['Browser billing status loader contains no Stripe secret', service.includes('loadPremiumBillingStatus') && !service.includes('STRIPE_SECRET_KEY')],
  ['Automatic Premium promotion requires a signed-in Free viewer', app.includes("Boolean(accountSession?.user?.id) &&\n      !entitlements.isPremium")],
  ['Automatic promotion still waits five visible minutes', app.includes('REFERRAL_PROMO_WATCH_MS = 5 * 60 * 1000')],
  ['Automatic promotion still respects thirty seconds of Chat inactivity', app.includes('REFERRAL_PROMO_CHAT_IDLE_MS = 30 * 1000')],
  ['Automatic promotion still has one-show-per-session protection', app.includes('referralPromoShownThisSessionRef.current')],
  ['Automatic promotion still has a 24-hour dismissal cooldown', app.includes('REFERRAL_PROMO_COOLDOWN_MS = 24 * 60 * 60 * 1000')],
  ['Premium modal is desktop-wide and viewport safe', styles.includes('width: min(820px, calc(100vw - 32px));') && styles.includes('max-height: calc(100dvh - 32px);')],
  ['Premium modal has responsive billing details and benefit grids', styles.includes('.premium-billing-details-grid') && styles.includes('.premium-benefit-grid')],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nSquadView Phase 4.1 Premium & Billing verification failed.');
  process.exit(1);
}

console.log('\nSquadView Phase 4.1 Premium & Billing verification passed.');
