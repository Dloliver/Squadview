// SquadView Creator Studio — published-only, anonymous live resolver.
// Deploy only after verifying anon access, Twitch secrets, and edge gateway protections.
// Instance-local cache/rate controls are load-shedding, NOT global distributed rate limits.
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const fail = (code: string, status = 503) =>
  new Response(JSON.stringify({ ok: false, code }), { status, headers });
const reply = (body: unknown) =>
  new Response(JSON.stringify(body), { headers });
const loginPattern = /^[a-z0-9_]{1,25}$/;
const slugPattern = /^[a-z0-9][a-z0-9_-]{2,39}$/;
const MAX_BODY_BYTES = 512;
const LIVE_TTL_MS = 20_000;
const MAX_CACHE_KEYS = 64;
const LIMIT_WINDOW_MS = 60_000;
const LIMIT_REQUESTS = 30;
const MAX_IN_FLIGHT = 12;
let appToken: { value: string; until: number } | null = null;
let tokenInFlight: Promise<string> | null = null;
let inFlight = 0;
const liveCache = new Map<string, { until: number; live: string[] }>();
const liveRequests = new Map<string, Promise<string[]>>();
const requesterWindows = new Map<string, { start: number; count: number }>();

function allowRequest(request: Request): boolean {
  // This is best-effort per-isolate abuse friction. Forwarded headers may be spoofed.
  // Use trusted edge/WAF rate-limits for real production enforcement.
  const marker = request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const id = marker.slice(0, 96);
  const now = Date.now();
  if (requesterWindows.size > 1000) {
    for (const [key, state] of requesterWindows) {
      if (now - state.start > LIMIT_WINDOW_MS) requesterWindows.delete(key);
    }
    if (requesterWindows.size > 1000) requesterWindows.clear();
  }
  const previous = requesterWindows.get(id);
  const current = !previous || now - previous.start >= LIMIT_WINDOW_MS
    ? { start: now, count: 1 }
    : { start: previous.start, count: previous.count + 1 };
  requesterWindows.set(id, current);
  return current.count <= LIMIT_REQUESTS;
}

async function getAppToken(clientId: string, secret: string): Promise<string> {
  if (appToken && appToken.until > Date.now() + 60_000) return appToken.value;
  if (!tokenInFlight) {
    tokenInFlight = (async () => {
      const response = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: secret,
          grant_type: "client_credentials",
        }),
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) throw new Error("twitch_token_unavailable");
      const token = await response.json();
      if (typeof token.access_token !== "string" || !token.access_token) {
        throw new Error("twitch_token_invalid");
      }
      appToken = {
        value: token.access_token,
        until: Date.now() +
          Math.max(0, Number(token.expires_in || 0) - 120) * 1000,
      };
      return token.access_token;
    })().finally(() => {
      tokenInFlight = null;
    });
  }
  return await tokenInFlight;
}

async function twitchLive(
  logins: string[],
  clientId: string,
  token: string,
): Promise<string[]> {
  const url = new URL("https://api.twitch.tv/helix/streams");
  for (const login of logins) url.searchParams.append("user_login", login);
  const response = await fetch(url, {
    headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("twitch_live_unavailable");
  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new Error("twitch_live_invalid");
  const roster = new Set(logins);
  const found: string[] = [];
  for (const entry of payload.data) {
    const login = entry?.user_login;
    if (entry?.type === "live" && typeof login === "string") {
      const normalized = login.toLowerCase();
      if (roster.has(normalized) && !found.includes(normalized)) {
        found.push(normalized);
      }
    }
  }
  return found;
}

async function verifiedLive(
  roster: string[],
  clientId: string,
  secret: string,
): Promise<string[]> {
  if (!roster.length) return [];
  const key = [...roster].sort().join(",");
  const cached = liveCache.get(key);
  if (cached && cached.until > Date.now()) return cached.live;
  const ongoing = liveRequests.get(key);
  if (ongoing) return await ongoing;
  const work = (async () => {
    const token = await getAppToken(clientId, secret);
    const live = await twitchLive(roster, clientId, token);
    if (liveCache.size >= MAX_CACHE_KEYS) {
      liveCache.delete(liveCache.keys().next().value!);
    }
    liveCache.set(key, { until: Date.now() + LIVE_TTL_MS, live });
    return live;
  })().finally(() => {
    liveRequests.delete(key);
  });
  liveRequests.set(key, work);
  return await work;
}

// Shared rate limits use a privileged server-only key. The key is never returned.
// Production configuration uses Supabase's injected named secret keys.
type SharedLimitStatus = "allowed" | "blocked" | "unavailable";
function readServerOnlyKey(): string {
  try {
    const configured = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (typeof configured?.default === "string" && configured.default) {
      return configured.default;
    }
  } catch {
    // Check legacy or single-key compatibility below.
  }
  return Deno.env.get("SUPABASE_SECRET_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

async function checkSharedRateLimit(
  supabaseUrl: string,
  slug: string,
): Promise<SharedLimitStatus> {
  const key = readServerOnlyKey();
  if (!key) return "unavailable"; // Fail closed when no trusted backend key.
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/squadview_creator_public_rate_allow`,
      {
        method: "POST",
        headers: {
          apikey: key,
          // Legacy service_role JWTs support Bearer; sb_secret keys do not.
          ...(key.split(".").length === 3
            ? { Authorization: `Bearer ${key}` }
            : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_slug: slug }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return "unavailable";
    const allowed: unknown = await response.json();
    if (allowed === true) return "allowed";
    if (allowed === false) return "blocked";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") return fail("method_not_allowed", 405);
  if (!allowRequest(request)) return fail("rate_limited", 429);
  if (inFlight >= MAX_IN_FLIGHT) return fail("temporarily_busy", 503);
  inFlight++;
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_BODY_BYTES) return fail("request_too_large", 413);
    // Also enforce body size if Content-Length is absent or inaccurate.
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return fail("request_too_large", 413);
    }
    let body: { slug?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return fail("invalid_json", 400);
    }
    const slug = typeof body?.slug === "string"
      ? body.slug.trim().toLowerCase()
      : "";
    if (!slugPattern.test(slug)) return fail("invalid_slug", 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    // API keys belong on `apikey`; new sb_publishable keys are NOT bearer JWTs.
    const legacyAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const singlePublishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    let namedPublishableKey = "";
    try {
      const names = JSON.parse(
        Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}",
      );
      if (typeof names?.default === "string") {
        namedPublishableKey = names.default;
      }
    } catch {
      // Malformed named-key config falls back to the other supported keys.
    }
    const publicRestKey = singlePublishableKey || namedPublishableKey ||
      legacyAnonKey;
    const clientId = Deno.env.get("TWITCH_CLIENT_ID");
    const secret = Deno.env.get("TWITCH_CLIENT_SECRET");
    if (!supabaseUrl || !publicRestKey || !clientId || !secret) {
      return fail("server_not_configured");
    }

    // Check a SHARED rate counter before public publication/Twitch lookups.
    // A missing or failing limiter is NOT permission to skip protection.
    const sharedLimit = await checkSharedRateLimit(supabaseUrl, slug);
    if (sharedLimit === "blocked") return fail("rate_limited", 429);
    if (sharedLimit !== "allowed") return fail("rate_limit_unavailable", 503);

    // Always check the current publication; NEVER cache this lookup.
    // An unpublish or activation switch must take effect at the next request.
    const lookup = await fetch(
      `${supabaseUrl}/rest/v1/rpc/squadview_public_creator_squad`,
      {
        method: "POST",
        headers: {
          apikey: publicRestKey,
          // Preserve legacy anon JWT compatibility; never use sb_publishable as Bearer.
          ...(publicRestKey.split(".").length === 3
            ? { Authorization: `Bearer ${publicRestKey}` }
            : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_slug: slug }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!lookup.ok) throw new Error("published_lookup_failed");
    const squad = await lookup.json();
    if (!squad) return reply({ ok: false, code: "not_published" });
    if (!Array.isArray(squad.members) || squad.members.length > 50) {
      throw new Error("invalid_published_roster");
    }
    const roster = squad.members.map((item: { twitch_login?: unknown }) =>
      item?.twitch_login
    );
    if (
      roster.some((item: unknown) =>
        typeof item !== "string" || !loginPattern.test(item)
      )
    ) {
      throw new Error("invalid_published_roster");
    }
    if (new Set(roster).size !== roster.length) {
      throw new Error("invalid_published_roster");
    }

    const live = await verifiedLive(roster, clientId, secret);
    return reply({
      ok: true,
      slug,
      title: String(squad.title || ""),
      description: String(squad.description || ""),
      live,
      rosterCount: roster.length,
      version: squad.version,
    });
  } catch {
    // A partial/failed Twitch response must never be treated as 'no one live'.
    return fail("live_lookup_unavailable");
  } finally {
    inFlight--;
  }
});
