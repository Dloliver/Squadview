import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('src/App.jsx');
const styles = read('src/styles.css');
const plans = read('src/config/plans.js');
const service = read('src/services/billingService.js');
const checkout = read('supabase/functions/squadview-billing/index.ts');
const webhook = read('supabase/functions/stripe-webhook/index.ts');
const migration = read('supabase/migrations/20261017_squadview_stripe_premium.sql');
const config = read('supabase/config.toml');
const terms = read('src/pages/TermsPage.jsx');
const privacy = read('src/pages/PrivacyPage.jsx');

const checks = [
  ['Paid Premium pricing is defined as $3.99 monthly and $34.99 annual', plans.includes("price: '$3.99'") && plans.includes("price: '$34.99'")],
  ['Annual plan shows the revised monthly equivalent and savings', plans.includes("equivalent: '$2.92/mo'") && plans.includes("savings: 'Save 27%'")],
  ['Viewer Premium rail opens the dedicated Premium workspace', app.includes("openPremiumBillingDetails('viewer_rail')") && app.includes('See Premium options')],
  ['Dedicated Premium modal offers monthly and annual checkout', app.includes("startPremiumCheckout('monthly', 'premium_modal')") && app.includes("startPremiumCheckout('annual', 'premium_modal')")],
  ['Account modal opens Premium & Billing instead of embedding checkout', app.includes("openPremiumBillingDetails('account')") && app.includes('Premium & Billing')],
  ['Stripe subscribers get a Manage Premium billing action', app.includes('Manage Premium billing') && app.includes('openPremiumBillingPortal')],
  ['Signed-out paid upgrade intent survives Twitch OAuth', app.includes('PENDING_PREMIUM_PLAN_KEY') && app.includes("'post_twitch_signin'")],
  ['Checkout success polls server-owned entitlements before claiming Premium', app.includes('Finishing your Premium upgrade') && app.includes('loadSquadViewEntitlements(accountSession.user.id)')],
  ['Stripe secrets never appear in browser service code', !service.includes('STRIPE_SECRET_KEY') && !app.includes('STRIPE_SECRET_KEY')],
  ['Browser billing service invokes a server-side Edge Function', service.includes("const BILLING_FUNCTION = 'squadview-billing'") && service.includes('client.functions.invoke')],
  ['Browser billing service can load server-owned billing status', service.includes("invokeBilling('get_status')") && service.includes('loadPremiumBillingStatus')],
  ['Checkout Edge Function authenticates the SquadView user', checkout.includes('authenticateUser(req, admin)') && checkout.includes('admin.auth.getUser')],
  ['Checkout attaches the SquadView user to Stripe metadata', checkout.includes('metadata[squadview_user_id]') && checkout.includes('subscription_data[metadata][squadview_user_id]')],
  ['Test and live Stripe data are separated', checkout.includes('STRIPE_ENVIRONMENT') && checkout.includes("'stripe_live'") && webhook.includes('STRIPE_ENVIRONMENT')],
  ['Checkout uses trusted monthly/annual Stripe Price IDs', checkout.includes('STRIPE_PREMIUM_MONTHLY_PRICE_ID') && checkout.includes('STRIPE_PREMIUM_ANNUAL_PRICE_ID')],
  ['Billing status is scoped to the configured Stripe environment', checkout.includes(".eq('provider', stripeProvider())") && checkout.includes("action === 'get_status'")],
  ['Billing portal refuses referral/lifetime-only users without a Stripe subscription', checkout.includes("'no_paid_subscription'") && checkout.includes('status.hasStripeSubscription')],
  ['Webhook verifies Stripe signatures against raw payload', webhook.includes('stripe-signature') && webhook.includes('verifyStripeSignature(raw, signature)') && webhook.includes("`${timestamp}.${payload}`")],
  ['Webhook handles subscription create/update/delete lifecycle', webhook.includes('customer.subscription.created') && webhook.includes('customer.subscription.updated') && webhook.includes('customer.subscription.deleted')],
  ['Webhook handles successful and failed subscription invoices', webhook.includes('invoice.paid') && webhook.includes('invoice.payment_failed')],
  ['Webhook maps paid status into Premium entitlements', webhook.includes("plan_key: 'premium'") && webhook.includes('viewer_max_streams: 16') && webhook.includes('squadview_ads: false')],
  ['Webhook safely falls back to Free without deleting referral/lifetime fields', webhook.includes("plan_key: 'free'") && webhook.includes('viewer_max_streams: 8') && !webhook.includes('promo_premium_until:') && !webhook.includes('lifetime_premium:')],
  ['Out-of-order Stripe subscription events are guarded', migration.includes('provider_event_created_at') && webhook.includes('incomingTime < existingTime')],
  ['Stripe webhook is explicitly public for signature verification', config.includes('[functions.stripe-webhook]') && config.includes('verify_jwt = false')],
  ['Paid subscription terms are disclosed', terms.includes('Paid Premium subscriptions') && terms.includes('renews automatically until canceled')],
  ['Stripe billing privacy disclosure is installed', privacy.includes('Premium billing') && privacy.includes('Full payment card numbers')],
  ['Dedicated Premium billing UI styling is installed', styles.includes('.premium-billing-modal') && styles.includes('.premium-billing-details-grid') && styles.includes('.premium-billing-plan-options')],
  ['Phase 3.4 safe Premium rail behavior remains present', app.includes('REFERRAL_PROMO_CHAT_IDLE_MS = 30 * 1000') && app.includes('referralPromoShownThisSessionRef')],
  ['Premium promotion retains a 24-hour dismissal cooldown', app.includes('REFERRAL_PROMO_COOLDOWN_MS = 24 * 60 * 60 * 1000')],
  ['Automatic Premium promotion targets signed-in Free viewers', app.includes('Boolean(accountSession?.user?.id)') && app.includes('!entitlements.isPremium')],
  ['Phase 3.4.1 automatic Favorite live refresh remains present', app.includes('AUTO_FILL_FAVORITES_KEY') && app.includes('refreshFollowedLiveStreams')],
  ['Premium trial duration is defined as 10 days', plans.includes('export const PREMIUM_TRIAL_DAYS = 10')],
  ['Premium rail and Premium modal disclose the introductory trial', app.includes('Try Premium free for {PREMIUM_TRIAL_DAYS} days') && app.includes('`${PREMIUM_TRIAL_DAYS}-day free trial`')],
  ['Stripe Checkout applies a 10-day trial while still collecting a payment method', checkout.includes('subscription_data[trial_period_days]') && checkout.includes("params.set('payment_method_collection', 'always')") && checkout.includes("'10'")],
  ['Paid trial eligibility is limited to the first Stripe subscription per environment', checkout.includes('hasUsedPaidTrial') && checkout.includes(".eq('provider', stripeProvider())") && checkout.includes('trialEligible: rows.length === 0')],
  ['Paid Premium terms disclose trial conversion and cancellation timing', terms.includes('10-day free trial') && terms.includes('canceled before the trial ends')],
];

let failed = false;
for (const [label, pass] of checks) {
  if (pass) console.log(`PASS  ${label}`);
  else {
    console.error(`FAIL  ${label}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('\nSquadView Phase 4 Paid Premium verification passed.');
