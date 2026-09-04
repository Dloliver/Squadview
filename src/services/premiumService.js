import { supabase } from '../lib/supabase';
import { FREE_ENTITLEMENTS, normalizeEntitlements } from '../config/plans';

export async function loadSquadViewEntitlements(userId) {
  if (!userId || !supabase) return { ...FREE_ENTITLEMENTS };

  const { data, error } = await supabase
    .from('squadview_entitlements')
    .select(`
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
    `)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Keep the existing viewer usable while the monetization migration is being applied.
    // Once the table exists, unexpected entitlement errors should still surface.
    if (error.code === '42P01' || error.code === 'PGRST205') return { ...FREE_ENTITLEMENTS };
    throw error;
  }
  return normalizeEntitlements(data);
}
