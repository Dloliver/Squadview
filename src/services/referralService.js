import { supabase } from '../lib/supabase';

const PENDING_REFERRAL_KEY = 'squadview:pending-referral:v1';
const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{6,16}$/;
const PENDING_REFERRAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function normalizeReferralCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : '';
}

function isMissingReferralRpc(error) {
  return ['42883', 'PGRST202', 'PGRST205'].includes(error?.code);
}

function normalizeReferralSummary(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      available: false,
      referralCode: '',
      qualifiedReferrals: 0,
      rewardMonthsEarned: 0,
      promoPremiumUntil: null,
      lifetimePremium: false,
      nextMonthProgress: 0,
      nextMonthRemaining: 5,
      lifetimeRemaining: 100,
    };
  }

  const qualifiedReferrals = Math.max(0, Number(payload.qualified_referrals) || 0);
  const lifetimePremium = Boolean(payload.lifetime_premium);
  const nextMonthProgress = lifetimePremium ? 5 : qualifiedReferrals % 5;

  return {
    available: true,
    referralCode: normalizeReferralCode(payload.referral_code),
    qualifiedReferrals,
    rewardMonthsEarned: Math.max(0, Number(payload.reward_months_earned) || 0),
    promoPremiumUntil: payload.promo_premium_until || null,
    lifetimePremium,
    nextMonthProgress,
    nextMonthRemaining: lifetimePremium ? 0 : 5 - nextMonthProgress,
    lifetimeRemaining: Math.max(0, 100 - qualifiedReferrals),
  };
}

export function capturePendingReferralFromLocation() {
  if (typeof window === 'undefined') return '';

  try {
    const url = new URL(window.location.href);
    const code = normalizeReferralCode(url.searchParams.get('ref'));
    if (!code) return '';

    localStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify({
      code,
      capturedAt: Date.now(),
    }));
    return code;
  } catch {
    return '';
  }
}

export function getPendingReferralCode() {
  if (typeof window === 'undefined') return '';

  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_REFERRAL_KEY) || 'null');
    const code = normalizeReferralCode(pending?.code);
    const capturedAt = Number(pending?.capturedAt) || 0;

    if (!code || !capturedAt || Date.now() - capturedAt > PENDING_REFERRAL_MAX_AGE_MS) {
      localStorage.removeItem(PENDING_REFERRAL_KEY);
      return '';
    }

    return code;
  } catch {
    return '';
  }
}

export function clearPendingReferral() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PENDING_REFERRAL_KEY);
  } catch {
    // Restricted storage should not block SquadView.
  }
}

export async function loadSquadViewReferralSummary() {
  if (!supabase) return normalizeReferralSummary(null);

  const { data, error } = await supabase.rpc('get_squadview_referral_summary');
  if (error) {
    if (isMissingReferralRpc(error)) return normalizeReferralSummary(null);
    throw error;
  }

  return normalizeReferralSummary(data);
}

export async function claimSquadViewReferral(referralCode) {
  const code = normalizeReferralCode(referralCode);
  if (!supabase || !code) return { available: false, status: 'no_referral' };

  const { data, error } = await supabase.rpc('claim_squadview_referral', {
    p_referral_code: code,
  });

  if (error) {
    if (isMissingReferralRpc(error)) return { available: false, status: 'unavailable' };
    throw error;
  }

  const result = data && typeof data === 'object' ? data : {};
  const terminalStatuses = new Set([
    'qualified',
    'already_claimed',
    'existing_user_not_eligible',
    'invalid_referral',
    'self_referral',
  ]);

  if (terminalStatuses.has(result.status)) clearPendingReferral();

  return {
    available: true,
    ...result,
  };
}
