// Phase 5.0B.3E: hermetic tests for the actual local creator-public-live handler.
// Run: deno test --allow-read --allow-write --allow-env scripts/verify-creator-public-live-runtime.test.ts
// No --allow-net: any real network request is forbidden. No production mutations.
function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown, message = "Values differ") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

const SOURCE = new URL("../supabase/functions/creator-public-live/index.ts", import.meta.url);
const originalFetch = globalThis.fetch;
const envKeys = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_SECRET_KEYS", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"];
const oldEnv = new Map(envKeys.map((key) => [key, Deno.env.get(key)]));

type Squad = { title: string; description: string; version: number; members: { twitch_login: string }[] } | null;
type Handler = (request: Request) => Promise<Response>;

Deno.test({ name: "public live resolver: isolated mocked runtime regression", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const source = await Deno.readTextFile(SOURCE);
  const entry = "Deno.serve(async (request) => {";
  assertEquals(source.split(entry).length - 1, 1, "Expected single Deno.serve entrypoint");
  assert(source.trimEnd().endsWith("});"), "Unexpected source ending");
  // Transform only a TEMPORARY copy; do not modify production source.
  const testable = source.replace(entry, "export const handler = async (request: Request) => {").replace(/\}\);\s*$/, "};\n");
  const temp = await Deno.makeTempDir({ prefix: "sv-creator-live-tests-" });
  try {
    const file = `${temp}/handler.ts`;
    await Deno.writeTextFile(file, testable);
    const { handler } = (await import(`file://${file}`)) as { handler: Handler };
    Deno.env.set("SUPABASE_URL", "https://mock-supabase.invalid");
    Deno.env.set("SUPABASE_ANON_KEY", "mock-anon-key");
    Deno.env.delete("SUPABASE_PUBLISHABLE_KEY");
    Deno.env.delete("SUPABASE_PUBLISHABLE_KEYS");
    Deno.env.set("TWITCH_CLIENT_ID", "mock-twitch-id");
    Deno.env.set("TWITCH_CLIENT_SECRET", "mock-twitch-secret");
    Deno.env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: "sb_secret_mock-limiter" }));
    Deno.env.delete("SUPABASE_SECRET_KEY");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");

    let squad: Squad = null;
    let twitchEntries: unknown[] = [];
    let lookupCount = 0;
    let liveCount = 0;
    let tokenCount = 0;
    let failedLookup = false;
    let failedTwitch = false;
    let requestedLogins: string[] = [];
    let expectedRestKey = "mock-anon-key";
    let sharedRateCalls = 0;
    let sharedAllowed = true;
    let sharedBackendFails = false;
    let unexpectedNetwork = false;

    globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === "https://mock-supabase.invalid/rest/v1/rpc/squadview_creator_public_rate_allow") {
        sharedRateCalls++;
        assertEquals(init?.method, "POST");
        assertEquals(JSON.parse(String(init?.body)).p_slug !== undefined, true);
        const h = init?.headers as Record<string, string>;
        assertEquals(h.apikey, "sb_secret_mock-limiter");
        assertEquals(h.Authorization, undefined); // new secret keys aren't JWTs
        return new Response(JSON.stringify(sharedAllowed), { status: sharedBackendFails ? 503 : 200 });
      }
      if (url === "https://mock-supabase.invalid/rest/v1/rpc/squadview_public_creator_squad") {
        lookupCount++;
        assertEquals(init?.method, "POST");
        assertEquals(JSON.parse(String(init?.body)).p_slug !== undefined, true);
        const requestHeaders = init?.headers as Record<string, string>;
        assertEquals(requestHeaders.apikey, expectedRestKey);
        // Publishable keys must never be placed in a Bearer header.
        if (expectedRestKey.startsWith("sb_publishable_")) {
          assertEquals(requestHeaders.Authorization, undefined);
        }
        return new Response(JSON.stringify(squad), { status: failedLookup ? 503 : 200 });
      }
      if (url === "https://id.twitch.tv/oauth2/token") {
        tokenCount++;
        return Response.json({ access_token: "mock-token", expires_in: 3600 });
      }
      if (url.startsWith("https://api.twitch.tv/helix/streams?")) {
        liveCount++;
        requestedLogins = new URL(url).searchParams.getAll("user_login");
        if (failedTwitch) return new Response("unavailable", { status: 503 });
        return Response.json({ data: twitchEntries });
      }
      unexpectedNetwork = true;
      throw new Error(`Unexpected external request: ${url}`);
    }) as typeof fetch;

    let serial = 0;
    async function call(slug: unknown = "basketball-crew", opts: { method?: string; raw?: string; ip?: string } = {}) {
      const req = new Request("https://local.test/functions/v1/creator-public-live", {
        method: opts.method || "POST",
        headers: { "content-type": "application/json", "x-real-ip": opts.ip || `test-ip-${++serial}` },
        ...(opts.method === "OPTIONS" || opts.method === "GET" ? {} : { body: opts.raw ?? JSON.stringify({ slug }) }),
      });
      const response = await handler(req);
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    }
    // Anonymous HTTP behavior and validation.
    assertEquals((await call(undefined, { method: "OPTIONS" })).status, 204);
    assertEquals((await call(undefined, { method: "GET" })).status, 405);
    assertEquals((await call("bad slug")).body.code, "invalid_slug");
    assertEquals((await call(undefined, { raw: "not json" })).body.code, "invalid_json");
    assertEquals((await call(undefined, { raw: "x".repeat(513) })).status, 413);
    assertEquals(lookupCount, 0);

    // New publishable keys are sent only on `apikey`, not as Bearer JWTs.
    Deno.env.delete("SUPABASE_ANON_KEY");
    Deno.env.set("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_mock-key");
    expectedRestKey = "sb_publishable_mock-key";
    const publishableResult = await call("inactive-test");
    assertEquals(publishableResult.body.code, "not_published");
    Deno.env.delete("SUPABASE_PUBLISHABLE_KEY");
    Deno.env.set("SUPABASE_ANON_KEY", "mock-anon-key");
    expectedRestKey = "mock-anon-key";

    // Inactive/unknown Squad never calls Twitch or returns a roster.
    const absent = await call("inactive-test");
    assertEquals(absent.body, { ok: false, code: "not_published" });
    assertEquals(liveCount, 0);

    // All approved channels, including manually added/non-followed. No unapproved channels.
    squad = { title: "Basketball Crew", description: "Game night", version: 2,
      members: [{ twitch_login: "approveda" }, { twitch_login: "approvedb" }, { twitch_login: "approvedc" }] };
    twitchEntries = [
      { user_login: "approveda", type: "live" },
      { user_login: "outsider", type: "live" },
      { user_login: "approvedb", type: "" },
      { user_login: "APPROVEDC", type: "live" },
    ];
    const first = await call();
    assertEquals(first.body.ok, true);
    assertEquals(first.body.live, ["approveda", "approvedc"]);
    assertEquals(first.body.rosterCount, 3);
    assertEquals(requestedLogins, ["approveda", "approvedb", "approvedc"]);
    assertEquals(tokenCount, 1);
    assertEquals(liveCount, 1);

    // Same roster: Twitch data cached, publication still checked EACH request.
    const again = await call();
    assertEquals(again.body.live, ["approveda", "approvedc"]);
    assertEquals(liveCount, 1);
    assertEquals(lookupCount, 4); // publishable + inactive + first + again
    squad = null;
    const deactivated = await call();
    assertEquals(deactivated.body.code, "not_published");
    assertEquals(liveCount, 1);
    assertEquals(lookupCount, 5);

    // Malformed published snapshots fail closed (never query arbitrary Twitch usernames).
    squad = { title: "Invalid", description: "", version: 1,
      members: [{ twitch_login: "approveda" }, { twitch_login: "../../outside" }] };
    const invalid = await call("broken-roster");
    assertEquals(invalid.body.ok, false);
    assertEquals(invalid.body.code, "live_lookup_unavailable");
    assertEquals(liveCount, 1);

    // Failed publication lookup fails closed.
    failedLookup = true;
    const noDatabase = await call("db-unavailable");
    assertEquals(noDatabase.body.code, "live_lookup_unavailable");
    failedLookup = false;

    // Twitch failure fails closed for uncached roster.
    squad = { title: "Tournament", description: "", version: 1, members: [{ twitch_login: "freshlogin" }] };
    failedTwitch = true;
    const noTwitch = await call("tournament-night");
    assertEquals(noTwitch.body.code, "live_lookup_unavailable");
    assertEquals(noTwitch.status, 503);
    failedTwitch = false;
    twitchEntries = [];
    const offline = await call("tournament-night");
    assertEquals(offline.body.ok, true);
    assertEquals(offline.body.live, []);

    // Cross-instance limiter blocks before publication and Twitch queries.
    const beforeSharedBlockLookups = lookupCount;
    const beforeSharedBlockTwitch = liveCount;
    sharedAllowed = false;
    const sharedDenied = await call("basketball-crew");
    assertEquals(sharedDenied.status, 429);
    assertEquals(sharedDenied.body.code, "rate_limited");
    assertEquals(lookupCount, beforeSharedBlockLookups);
    assertEquals(liveCount, beforeSharedBlockTwitch);
    sharedAllowed = true;
    sharedBackendFails = true;
    const unavailableLimit = await call("basketball-crew");
    assertEquals(unavailableLimit.status, 503);
    assertEquals(unavailableLimit.body.code, "rate_limit_unavailable");
    assertEquals(lookupCount, beforeSharedBlockLookups);
    sharedBackendFails = false;
    assert(sharedRateCalls > 0, "Shared rate limiter was never invoked");

    // Per-instance rate limiting: distinguish this from gateway-level protection.
    let rateLimited = false;
    for (let i = 0; i < 31; i++) {
      const result = await call("invalid slug", { ip: "same-test-ip" });
      if (i === 30) rateLimited = result.status === 429;
    }
    assert(rateLimited, "Expected 31st same-IP request to be rate-limited");
    assertEquals(unexpectedNetwork, false);
    console.log("PASS: anonymous validation, inactive privacy, approved-live filtering, caching, deactivation, failures and local rate limit");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of oldEnv) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
    await Deno.remove(temp, { recursive: true });
  }
}});
