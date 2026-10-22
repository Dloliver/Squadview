import { createClient, type User } from 'npm:@supabase/supabase-js@2';

const STRIPE_API = 'https://api.stripe.com/v1';
const ACTIVE_PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function requiredEnv(name: string) {
  const value = String(Deno.env.get(name) || '').trim();
  if (!value) throw new ApiError(500, 'billing_server_not_configured', `Missing required Edge Function secret: ${name}.`);
  return value;
}

function optionalEnv(name: string, fallback = '') {
  return String(Deno.env.get(name) || fallback).trim();
}

function stripeProvider() {
  return optionalEnv('STRIPE_ENVIRONMENT', 'test').toLowerCase() === 'live' ? 'stripe_live' : 'stripe_test';
}

function readServiceKey() {
  const legacy = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  if (legacy) return legacy;
  const raw = String(Deno.env.get('SUPABASE_SECRET_KEYS') || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const preferred = parsed?.default;
      if (typeof preferred === 'string' && preferred.trim()) return preferred.trim();
      const first = Object.values(parsed || {}).find((value) => typeof value === 'string' && value.trim());
      if (typeof first === 'string') return first.trim();
    } catch {}
  }
  throw new ApiError(500, 'supabase_server_not_configured', 'No Supabase server secret is available to the Edge Function.');
}

function createAdminClient() {
  return createClient(requiredEnv('SUPABASE_URL'), readServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bearerToken(req: Request) {
  const match = String(req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new ApiError(401, 'authentication_required', 'Connect Twitch to SquadView before upgrading.');
  return match[1];
}

async function authenticateUser(req: Request, admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin.auth.getUser(bearerToken(req));
  if (error || !data?.user?.id) throw new ApiError(401, 'authentication_required', 'Your SquadView session is no longer valid.');
  return data.user;
}

function userDisplayName(user: User) {
  const metadata = user.user_metadata || {};
  return [metadata.full_name, metadata.name, metadata.preferred_username, metadata.user_name, metadata.login]
    .find((value) => typeof value === 'string' && value.trim())?.trim() || '';
}

async function stripeRequest(path: string, body: URLSearchParams) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredEnv('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Stripe request failed with ${response.status}.`;
    throw new ApiError(response.status >= 500 ? 502 : 400, 'stripe_request_failed', message, payload?.error || payload);
  }
  return payload;
}

async function findOrCreateCustomer(admin: ReturnType<typeof createAdminClient>, user: User) {
  const { data: existing, error } = await admin
    .from('squadview_billing_customers')
    .select('provider_customer_id')
    .eq('user_id', user.id)
    .eq('provider', stripeProvider())
    .maybeSingle();

  if (error) throw new ApiError(500, 'billing_customer_lookup_failed', error.message);
  if (existing?.provider_customer_id) return existing.provider_customer_id;

  const body = new URLSearchParams();
  if (user.email) body.set('email', user.email);
  const name = userDisplayName(user);
  if (name) body.set('name', name);
  body.set('metadata[squadview_user_id]', user.id);

  const customer = await stripeRequest('/customers', body);
  if (!customer?.id) throw new ApiError(502, 'stripe_customer_missing', 'Stripe did not return a customer ID.');

  const { error: upsertError } = await admin
    .from('squadview_billing_customers')
    .upsert({
      user_id: user.id,
      provider: stripeProvider(),
      provider_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (upsertError) throw new ApiError(500, 'billing_customer_save_failed', upsertError.message);
  return customer.id as string;
}

async function findExistingCustomer(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from('squadview_billing_customers')
    .select('provider_customer_id')
    .eq('user_id', userId)
    .eq('provider', stripeProvider())
    .maybeSingle();

  if (error) throw new ApiError(500, 'billing_customer_lookup_failed', error.message);
  return String(data?.provider_customer_id || '').trim();
}

async function hasActivePaidSubscription(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from('squadview_subscriptions')
    .select('status')
    .eq('user_id', userId)
    .eq('provider', stripeProvider());

  if (error) throw new ApiError(500, 'subscription_lookup_failed', error.message);
  return (data || []).some((row) => ACTIVE_PAID_STATUSES.has(String(row.status || '').toLowerCase()));
}

async function hasUsedPaidTrial(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from('squadview_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', stripeProvider())
    .limit(1);

  if (error) throw new ApiError(500, 'trial_lookup_failed', error.message);
  return Boolean(data?.length);
}

async function readPremiumBillingStatus(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from('squadview_subscriptions')
    .select('provider_subscription_id, plan_key, status, billing_interval, cancel_at_period_end, cancel_at, current_period_start, current_period_end, updated_at')
    .eq('user_id', userId)
    .eq('provider', stripeProvider())
    .order('updated_at', { ascending: false });

  if (error) throw new ApiError(500, 'subscription_lookup_failed', error.message);

  const rows = data || [];
  const current = rows.find((row) => ACTIVE_PAID_STATUSES.has(String(row.status || '').toLowerCase())) || rows[0] || null;
  const customerId = await findExistingCustomer(admin, userId);

  return {
    environment: stripeProvider() === 'stripe_live' ? 'live' : 'test',
    hasStripeSubscription: Boolean(current?.provider_subscription_id),
    canManageBilling: Boolean(current?.provider_subscription_id && customerId),
    trialEligible: rows.length === 0,
    status: String(current?.status || ''),
    billingInterval: current?.billing_interval || null,
    cancelAtPeriodEnd: Boolean(current?.cancel_at_period_end || current?.cancel_at),
    cancelAt: current?.cancel_at || null,
    currentPeriodStart: current?.current_period_start || null,
    currentPeriodEnd: current?.current_period_end || null,
    updatedAt: current?.updated_at || null,
    customerId,
  };
}

function appUrl() {
  return optionalEnv('SQUADVIEW_APP_URL', 'https://squadview.app').replace(/\/$/, '');
}

function priceForPlan(plan: string) {
  if (plan === 'annual') return requiredEnv('STRIPE_PREMIUM_ANNUAL_PRICE_ID');
  if (plan === 'monthly') return requiredEnv('STRIPE_PREMIUM_MONTHLY_PRICE_ID');
  throw new ApiError(400, 'invalid_plan', 'Choose either the monthly or annual Premium plan.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, code: 'method_not_allowed', message: 'POST required.' }, 405);

  try {
    const admin = createAdminClient();
    const user = await authenticateUser(req, admin);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();

    if (action === 'get_status') {
      const status = await readPremiumBillingStatus(admin, user.id);
      const { customerId: _customerId, ...publicStatus } = status;
      return json({ ok: true, ...publicStatus });
    }

    if (action === 'create_checkout') {
      const customerId = await findOrCreateCustomer(admin, user);
      if (await hasActivePaidSubscription(admin, user.id)) {
        throw new ApiError(409, 'already_premium', 'Paid Premium is already active. Use Manage billing instead.');
      }

      const plan = String(body?.plan || '').trim().toLowerCase();
      const priceId = priceForPlan(plan);
      const success = `${appUrl()}/?premium=success&checkout_session_id={CHECKOUT_SESSION_ID}`;
      const cancel = `${appUrl()}/?premium=cancelled`;
      const params = new URLSearchParams();
      params.set('mode', 'subscription');
      params.set('customer', customerId);
      params.set('client_reference_id', user.id);
      params.set('line_items[0][price]', priceId);
      params.set('line_items[0][quantity]', '1');
      params.set('success_url', success);
      params.set('cancel_url', cancel);
      params.set('allow_promotion_codes', 'true');
      params.set('metadata[squadview_user_id]', user.id);
      params.set('metadata[squadview_plan]', plan);
      params.set('subscription_data[metadata][squadview_user_id]', user.id);
      params.set('subscription_data[metadata][squadview_plan]', plan);

      const trialEligible = !await hasUsedPaidTrial(admin, user.id);
      if (trialEligible) {
        params.set('payment_method_collection', 'always');
        params.set('subscription_data[trial_period_days]', '10');
        params.set('subscription_data[metadata][squadview_trial_days]', '10');
      }

      const checkout = await stripeRequest('/checkout/sessions', params);
      if (!checkout?.url) throw new ApiError(502, 'checkout_url_missing', 'Stripe Checkout did not return a URL.');
      return json({ ok: true, url: checkout.url, checkoutSessionId: checkout.id, plan, trialEligible, trialDays: trialEligible ? 10 : 0 });
    }

    if (action === 'create_portal') {
      const status = await readPremiumBillingStatus(admin, user.id);
      if (!status.hasStripeSubscription || !status.customerId) {
        throw new ApiError(409, 'no_paid_subscription', 'There is no Stripe Premium subscription to manage for this account.');
      }
      const params = new URLSearchParams();
      params.set('customer', status.customerId);
      params.set('return_url', `${appUrl()}/?billing=returned`);
      const portal = await stripeRequest('/billing_portal/sessions', params);
      if (!portal?.url) throw new ApiError(502, 'portal_url_missing', 'Stripe Billing Portal did not return a URL.');
      return json({ ok: true, url: portal.url });
    }

    throw new ApiError(400, 'unknown_action', 'Unknown billing action.');
  } catch (error) {
    const err = error instanceof ApiError
      ? error
      : new ApiError(500, 'billing_unexpected_error', error instanceof Error ? error.message : 'Unexpected billing error.');
    return json({ ok: false, code: err.code, message: err.message }, err.status);
  }
});
