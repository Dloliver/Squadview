import { supabase } from '../lib/supabase';

function requireSupabase() {
  if (!supabase) throw new Error('SquadView account sync is not configured yet.');
  return supabase;
}

function normalizeMember(member) {
  return {
    id: member?.id || '',
    twitchLogin: String(member?.twitch_login || '').trim().toLowerCase(),
    sortOrder: Number.isInteger(member?.sort_order) ? member.sort_order : 0,
  };
}

function normalizeSquad(row) {
  const members = Array.isArray(row?.members)
    ? row.members.map(normalizeMember).filter((member) => member.twitchLogin)
    : [];

  members.sort((first, second) => first.sortOrder - second.sortOrder);

  return {
    id: row?.id || '',
    name: String(row?.name || 'Saved Squad').trim() || 'Saved Squad',
    alertsEnabled: Boolean(row?.alerts_enabled),
    shareSlug: row?.share_slug || '',
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    members,
  };
}

export async function loadSavedSquads(userId) {
  if (!userId) return [];
  const client = requireSupabase();

  const { data, error } = await client
    .from('squadview_saved_squads')
    .select(`
      id,
      name,
      alerts_enabled,
      share_slug,
      created_at,
      updated_at,
      members:squadview_saved_squad_members (
        id,
        twitch_login,
        sort_order,
        created_at
      )
    `)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeSquad);
}

export async function createSavedSquad(userId, name, channels) {
  if (!userId) throw new Error('Sign in with Twitch before saving a Squad.');
  const client = requireSupabase();
  const cleanedChannels = [...new Set((channels || [])
    .map((channel) => String(channel || '').trim().toLowerCase())
    .filter(Boolean))];

  if (!cleanedChannels.length) throw new Error('Add at least one Twitch creator before saving a Squad.');

  const { data, error } = await client.rpc('create_squadview_saved_squad', {
    p_name: String(name || '').trim() || 'My Squad',
    p_channels: cleanedChannels,
  });

  if (error) throw error;
  return data;
}

export async function deleteSavedSquad(userId, squadId) {
  if (!userId || !squadId) return;
  const client = requireSupabase();

  const { error } = await client
    .from('squadview_saved_squads')
    .delete()
    .eq('id', squadId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function updateSavedSquad(userId, squadId, name, channels) {
  if (!userId || !squadId) throw new Error('Sign in with Twitch before editing a Squad.');
  const client = requireSupabase();
  const cleanedChannels = [...new Set((channels || [])
    .map((channel) => String(channel || '').trim().toLowerCase())
    .filter(Boolean))];

  if (!cleanedChannels.length) throw new Error('A Saved Squad needs at least one Twitch creator.');

  const { data, error } = await client.rpc('update_squadview_saved_squad', {
    p_squad_id: squadId,
    p_name: String(name || '').trim() || 'My Squad',
    p_channels: cleanedChannels,
  });

  if (error) throw error;
  return data;
}
