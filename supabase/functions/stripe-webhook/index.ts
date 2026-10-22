import { createClient } from 'npm:@supabase/supabase-js@2';

const STRIPE_API = 'https://api.stripe.com/v1';
const WEBHOOK_TOLERANCE_SECONDS = 300;
const ACTIVE_PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requiredEnv(name: string) {
  const value = String(Deno.env.get(name) || '').trim();
  if (!value) throw new ApiError(500, 'billing_server_not_configured', `Missing required Edge Function secret: ${name}.`);
  return value;
}

function configuredStripeEnvironment() {
  const environment = String(Deno.env.get('STRIPE_ENVIRONMENT') || '').trim().toLowerCase();
  if (environment !== 'test' && environment !== 'live') {
    throw new ApiError(500, 'invalid_stripe_environment', 'Stripe environment must be explicitly configured as test or live.');
  }
  return environment;
}

function stripeProvider() {
  return configuredStripeEnvironment() === 'live' ? 'stripe_live' : 'stripe_test';
}

function assertStripeEventEnvironment(event: unknown) {
  const expectedLive = configuredStripeEnvironment() === 'live';
  const eventLive = (event as { livemode?: unknown } | null)?.livemode;
  if (typeof eventLive !== 'boolean' || eventLive !== expectedLive) {
    throw new ApiError(400, 'stripe_environment_mismatch', 'Stripe event environment mismatch.');
  }
}

function readServiceKey() {
  const legacy = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  if (legacy) return legacy;
  const raw = String(Deno.env.get('SUPABASE_SECRET_KEYS') || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.default === 'string' && parsed.default.trim()) return parsed.default.trim();
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

async function stripeGet(path: string) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${requiredEnv('STRIPE_SECRET_KEY')}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(502, 'stripe_request_failed', payload?.error?.message || `Stripe returned ${response.status}.`);
  return payload;
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function verifyStripeSignature(payload: string, header: string) {
  const parts = header.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2) || '';
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  const timestampNumber = Number(timestamp);

  if (!timestamp || !Number.isFinite(timestampNumber) || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(requiredEnv('STRIPE_WEBHOOK_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = bytesToHex(digest);
  return signatures.some((signature) => constantTimeEqual(expected, signature));
}

function unixDate(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function subscriptionPeriod(subscription: any) {
  const firstItem = subscription?.items?.data?.[0];
  return {
    start: subscription?.current_period_start ?? firstItem?.current_period_start ?? null,
    end: subscription?.current_period_end ?? firstItem?.current_period_end ?? null,
  };
}

function subscriptionPriceId(subscription: any) {
  return String(subscription?.items?.data?.[0]?.price?.id || '');
}

function billingIntervalForPrice(priceId: string) {
  if (priceId && priceId === requiredEnv('STRIPE_PREMIUM_ANNUAL_PRICE_ID')) return 'annual';
  if (priceId && priceId === requiredEnv('STRIPE_PREMIUM_MONTHLY_PRICE_ID')) return 'monthly';
  return null;
}

async function resolveUserId(admin: ReturnType<typeof createAdminClient>, object: any) {
  const metadataUserId = String(object?.metadata?.squadview_user_id || '').trim();
  if (metadataUserId) return metadataUserId;

  const customerId = typeof object?.customer === 'string' ? object.customer : object?.customer?.id;
  if (!customerId) return '';
  const { data, error } = await admin
    .from('squadview_billing_customers')
    .select('user_id')
    .eq('provider', stripeProvider())
    .eq('provider_customer_id', customerId)
    .maybeSingle();
  if (error) throw new ApiError(500, 'billing_customer_lookup_failed', error.message);
  return data?.user_id || '';
}

async function syncEntitlements(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from('squadview_subscriptions')
    .select('status')
    .eq('user_id', userId)
    .eq('provider', stripeProvider());
  if (error) throw new ApiError(500, 'subscription_lookup_failed', error.message);

  const paidActive = (data || []).some((row) => ACTIVE_PAID_STATUSES.has(String(row.status || '').toLowerCase()));
  // Rewards remain independent of Stripe. A canceled/expired Stripe subscription
  // must never downgrade a still-active referral grant or lifetime Premium.
  const { data: existingEntitlement, error: rewardError } = await admin
    .from('squadview_entitlements')
    .select('promo_premium_until, lifetime_premium')
    .eq('user_id', userId)
    .maybeSingle();
  if (rewardError) throw new ApiError(500, 'reward_entitlement_lookup_failed', rewardError.message);
  const promoEnd = existingEntitlement?.promo_premium_until
    ? Date.parse(existingEntitlement.promo_premium_until)
    : NaN;
  const rewardActive = existingEntitlement?.lifetime_premium === true ||
    (Number.isFinite(promoEnd) && promoEnd > Date.now());
  const patch = (paidActive || rewardActive)
    ? {
        user_id: userId,
        plan_key: 'premium',
        squadview_ads: false,
        saved_squad_limit: null,
        max_squad_members: 16,
        viewer_max_streams: 16,
        youtube_companion: true,
        multi_window: true,
        live_squad_alerts: true,
        persistent_shared_squads: true,
        updated_at: new Date().toISOString(),
      }
    : {
        user_id: userId,
        plan_key: 'free',
        squadview_ads: true,
        saved_squad_limit: 3,
        max_squad_members: 8,
        viewer_max_streams: 8,
        youtube_companion: false,
        multi_window: false,
        live_squad_alerts: false,
        persistent_shared_squads: false,
        updated_at: new Date().toISOString(),
      };

  const { error: entitlementError } = await admin
    .from('squadview_entitlements')
    .upsert(patch, { onConflict: 'user_id' });
  if (entitlementError) throw new ApiError(500, 'entitlement_sync_failed', entitlementError.message);
}

async function syncSubscription(admin: ReturnType<typeof createAdminClient>, subscription: any, event: any) {
  const subscriptionId = String(subscription?.id || '').trim();
  if (!subscriptionId) return;

  const userId = await resolveUserId(admin, subscription);
  if (!userId) throw new ApiError(400, 'subscription_user_missing', `No SquadView user mapping for ${subscriptionId}.`);

  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  if (customerId) {
    await admin.from('squadview_billing_customers').upsert({
      user_id: userId,
      provider: stripeProvider(),
      provider_customer_id: customerId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  }

  const priceId = subscriptionPriceId(subscription);
  const interval = billingIntervalForPrice(priceId);
  const period = subscriptionPeriod(subscription);
  const status = String(subscription?.status || 'inactive').toLowerCase();
  const eventCreatedAt = unixDate(event?.created);

  const { data: existing, error: lookupError } = await admin
    .from('squadview_subscriptions')
    .select('id, provider_event_created_at')
    .eq('provider_subscription_id', subscriptionId)
    .maybeSingle();
  if (lookupError) throw new ApiError(500, 'subscription_lookup_failed', lookupError.message);

  if (existing?.provider_event_created_at && eventCreatedAt) {
    const existingTime = Date.parse(existing.provider_event_created_at);
    const incomingTime = Date.parse(eventCreatedAt);
    if (Number.isFinite(existingTime) && Number.isFinite(incomingTime) && incomingTime < existingTime) return;
  }

  const row = {
    user_id: userId,
    provider: stripeProvider(),
    provider_subscription_id: subscriptionId,
    provider_price_id: priceId || null,
    plan_key: interval ? 'premium' : 'free',
    status,
    // Flexible Stripe billing can schedule cancellation using cancel_at alone.
    cancel_at_period_end: Boolean(subscription?.cancel_at_period_end || subscription?.cancel_at),
    cancel_at: unixDate(subscription?.cancel_at),
    current_period_start: unixDate(period.start),
    current_period_end: unixDate(period.end),
    billing_interval: interval,
    provider_event_id: event?.id || null,
    provider_event_created_at: eventCreatedAt,
    updated_at: new Date().toISOString(),
  };

  let saveError = null;
  if (existing?.id) {
    ({ error: saveError } = await admin.from('squadview_subscriptions').update(row).eq('id', existing.id));
  } else {
    ({ error: saveError } = await admin.from('squadview_subscriptions').insert(row));
  }
  if (saveError) throw new ApiError(500, 'subscription_save_failed', saveError.message);

  await syncEntitlements(admin, userId);
}

function invoiceSubscriptionId(invoice: any) {
  const legacy = typeof invoice?.subscription === 'string' ? invoice.subscription : invoice?.subscription?.id;
  const modern = typeof invoice?.parent?.subscription_details?.subscription === 'string'
    ? invoice.parent.subscription_details.subscription
    : invoice?.parent?.subscription_details?.subscription?.id;
  return String(legacy || modern || '').trim();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, code: 'method_not_allowed' }, 405);

  try {
    const raw = await req.text();
    const signature = String(req.headers.get('stripe-signature') || '');
    if (!await verifyStripeSignature(raw, signature)) throw new ApiError(400, 'invalid_signature', 'Invalid Stripe webhook signature.');

    const event = JSON.parse(raw);
    // Reject wrong-mode events before creating a database client or writing any rows.
    assertStripeEventEnvironment(event);
    const admin = createAdminClient();
    const type = String(event?.type || '');
    const object = event?.data?.object || {};

    if (type === 'checkout.session.completed' && object?.mode === 'subscription') {
      const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id;
      const userId = String(object.client_reference_id || object?.metadata?.squadview_user_id || '').trim();
      if (userId && customerId) {
        const { error } = await admin.from('squadview_billing_customers').upsert({
          user_id: userId,
          provider: stripeProvider(),
          provider_customer_id: customerId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (error) throw new ApiError(500, 'billing_customer_save_failed', error.message);
      }
      const subscriptionId = typeof object.subscription === 'string' ? object.subscription : object.subscription?.id;
      if (subscriptionId) await syncSubscription(admin, await stripeGet(`/subscriptions/${subscriptionId}`), event);
    } else if (type === 'customer.subscription.created' || type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
      await syncSubscription(admin, object, event);
    } else if (type === 'invoice.paid' || type === 'invoice.payment_failed') {
      const subscriptionId = invoiceSubscriptionId(object);
      if (subscriptionId) await syncSubscription(admin, await stripeGet(`/subscriptions/${subscriptionId}`), event);
    }

    return json({ received: true });
  } catch (error) {
    const err = error instanceof ApiError
      ? error
      : new ApiError(500, 'webhook_unexpected_error', error instanceof Error ? error.message : 'Unexpected webhook error.');
    return json({ ok: false, code: err.code, message: err.message }, err.status);
  }
});
