import { supabase } from '../lib/supabase';

const BILLING_FUNCTION = 'squadview-billing';

function requireSupabase() {
  if (!supabase) throw new Error('SquadView billing is not configured yet.');
  return supabase;
}

function billingMessage(error, data, fallback) {
  const direct = data?.message || data?.error_description || data?.error;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim();
  return fallback;
}

async function invokeBilling(action, payload = {}) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(BILLING_FUNCTION, {
    body: { action, ...payload },
  });

  if (error || data?.ok === false) {
    let errorPayload = data;
    if (!errorPayload && typeof error?.context?.json === 'function') {
      try {
        errorPayload = await error.context.json();
      } catch {
        // The normal Functions error message remains useful if the body is unavailable.
      }
    }
    const nextError = new Error(billingMessage(error, errorPayload, 'SquadView billing is temporarily unavailable.'));
    nextError.code = errorPayload?.code || error?.name || 'billing_unavailable';
    throw nextError;
  }

  return data || {};
}

export async function createPremiumCheckoutSession(interval) {
  const plan = interval === 'annual' ? 'annual' : 'monthly';
  const data = await invokeBilling('create_checkout', { plan });
  if (!data.url) throw new Error('Stripe Checkout did not return a checkout URL.');
  return data;
}

export async function createPremiumBillingPortalSession() {
  const data = await invokeBilling('create_portal');
  if (!data.url) throw new Error('Stripe did not return a billing portal URL.');
  return data;
}

export async function loadPremiumBillingStatus() {
  const data = await invokeBilling('get_status');
  return {
    environment: data.environment || 'test',
    hasStripeSubscription: Boolean(data.hasStripeSubscription),
    canManageBilling: Boolean(data.canManageBilling),
    trialEligible: data.trialEligible !== false,
    status: String(data.status || ''),
    billingInterval: data.billingInterval || null,
    cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd || data.cancelAt),
    cancelAt: data.cancelAt || null,
    currentPeriodStart: data.currentPeriodStart || null,
    currentPeriodEnd: data.currentPeriodEnd || null,
    updatedAt: data.updatedAt || null,
  };
}
