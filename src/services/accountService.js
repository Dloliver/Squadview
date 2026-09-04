import { supabase, supabaseConfigured } from '../lib/supabase';
import { syncTwitchConnectionFromSession } from './twitchConnectionService';

export const isSquadViewAuthConfigured = supabaseConfigured;

function requireSupabase() {
  if (!supabase) {
    throw new Error('SquadView account sign in is not configured yet.');
  }
  return supabase;
}

function queueTwitchConnectionSync(session) {
  if (!session?.provider_token) return;

  const run = () => {
    void syncTwitchConnectionFromSession(session).catch((error) => {
      if (import.meta.env.DEV) {
        console.info('[SquadView Twitch connection] secure grant sync unavailable', error);
      }
    });
  };

  if (typeof window !== 'undefined') window.setTimeout(run, 0);
  else run();
}

function twitchIdentityData(user) {
  const identity = user?.identities?.find((item) => item?.provider === 'twitch');
  return {
    identity,
    data: identity?.identity_data || {},
  };
}

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || '';
}

export async function getCurrentAccountSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data.session || null;
  queueTwitchConnectionSync(session);
  return session;
}

export function subscribeToAccountChanges(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session || null);
    queueTwitchConnectionSync(session);
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithTwitch({ forceVerify = false } = {}) {
  const client = requireSupabase();
  const redirectTo = new URL('/watch', window.location.origin).toString();
  const options = {
    redirectTo,
    scopes: 'user:read:follows user:read:chat user:write:chat user:read:emotes',
  };
  if (forceVerify) {
    options.queryParams = { force_verify: 'true' };
  }
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'twitch',
    options,
  });
  if (error) throw error;
  return data;
}

export async function signOutOfSquadView() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function ensureSquadViewProfile(user) {
  if (!user?.id) return null;
  const client = requireSupabase();
  const { identity, data } = twitchIdentityData(user);
  const metadata = user.user_metadata || {};

  const twitchUserId = firstString(
    data.provider_id,
    data.sub,
    data.user_id,
    identity?.id,
  );

  const twitchLogin = firstString(
    data.preferred_username,
    data.user_name,
    data.login,
    metadata.preferred_username,
    metadata.user_name,
    metadata.login,
  ).toLowerCase();

  const displayName = firstString(
    data.display_name,
    data.name,
    metadata.full_name,
    metadata.name,
    twitchLogin,
    'Twitch user',
  );

  const avatarUrl = firstString(
    data.avatar_url,
    data.picture,
    metadata.avatar_url,
    metadata.picture,
  );

  const payload = {
    user_id: user.id,
    twitch_user_id: twitchUserId || null,
    twitch_login: twitchLogin || null,
    display_name: displayName,
    avatar_url: avatarUrl || null,
    updated_at: new Date().toISOString(),
  };

  const { data: profile, error } = await client
    .from('squadview_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return profile;
}

export async function loadSquadViewUserState(userId) {
  if (!userId) return null;
  const client = requireSupabase();
  const { data, error } = await client
    .from('squadview_user_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function saveSquadViewUserState(userId, patch) {
  if (!userId) return null;
  const client = requireSupabase();
  const payload = {
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from('squadview_user_state')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
