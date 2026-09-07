import { supabase } from '../lib/supabase';
import { FREE_ENTITLEMENTS, normalizeEntitlements } from '../config/plans';

const BASE_ENTITLEMENT_FIELDS = `
  plan_key,
  squadview_ads,
  saved_squad_limit,
  max_squad_members,
  viewer_max_streams,
  youtube_companion,
  multi_window,
  live_squad_alerts,
  persistent_shared_squads,
  updated_at
`;

const GROWTH_ENTITLEMENT_FIELDS = `
  ${BASE_ENTITLEMENT_FIELDS},
  promo_premium_until,
  lifetime_premium
`;

function isGrowthMigrationMissing(error) {
  return ['42703', 'PGRST204', 'PGRST205'].includes(error?.code);
}

async function readEntitlementRow(userId, fields) {
  return supabase
    .from('squadview_entitlements')
    .select(fields)
    .eq('user_id', userId)
    .maybeSingle();
}

export async function loadSquadViewEntitlements(userId) {
  if (!userId || !supabase) return { ...FREE_ENTITLEMENTS };

  let { data, error } = await readEntitlementRow(userId, GROWTH_ENTITLEMENT_FIELDS);

  if (error && isGrowthMigrationMissing(error)) {
    ({ data, error } = await readEntitlementRow(userId, BASE_ENTITLEMENT_FIELDS));
  }

  if (error) {
    // Keep the existing viewer usable while the monetization migration is being applied.
    // Once the table exists, unexpected entitlement errors should still surface.
    if (error.code === '42P01' || error.code === 'PGRST205') return { ...FREE_ENTITLEMENTS };
    throw error;
  }
  return normalizeEntitlements(data);
}
