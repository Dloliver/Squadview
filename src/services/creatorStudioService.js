import { supabase } from '../lib/supabase';

function client() {
  if (!supabase) throw new Error('SquadView account connection is not configured.');
  return supabase;
}

export async function loadCreatorSquads(userId) {
  if (!userId) return [];
  const { data, error } = await client().from('squadview_creator_squads')
    .select('id, slug, title, description, is_published, created_at, updated_at')
    .eq('owner_user_id', userId).order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function loadCreatorDraft(squadId) {
  const { data, error } = await client().from('squadview_creator_squad_members')
    .select('twitch_login,sort_order').eq('squad_id', squadId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => row.twitch_login);
}

export async function saveCreatorDraft({ id, slug, title, description, channels }) {
  const { data, error } = await client().rpc('squadview_creator_save_draft', {
    p_squad_id: id,
    p_slug: slug,
    p_title: title,
    p_description: description,
    p_channels: channels,
  });
  if (error) throw error;
  return data;
}

// Publishing operates only on saved server-side draft snapshots.
export async function publishCreatorSquad(squadId) {
  const { data, error } = await client().rpc('squadview_creator_publish', { p_squad_id: squadId });
  if (error) throw error;
  return data;
}

export async function unpublishCreatorSquad(squadId) {
  const { data, error } = await client().rpc('squadview_creator_unpublish', { p_squad_id: squadId });
  if (error) throw error;
  return data;
}
