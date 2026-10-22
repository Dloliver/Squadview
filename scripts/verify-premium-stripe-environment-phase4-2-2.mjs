import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = readFileSync('supabase/functions/stripe-webhook/index.ts', 'utf8');
const find = (start, end) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert(a >= 0 && b > a, `Missing boundary: ${start}`);
  return source.slice(a, b);
};
const guards = find('function configuredStripeEnvironment()', 'function readServiceKey()');
const js = guards
  .replace('event: unknown', 'event')
  .replace('(event as { livemode?: unknown } | null)?.livemode', 'event?.livemode');
const run = (environment, livemode) => {
  const ctx = vm.createContext({
    Deno: { env: { get: () => environment } },
    ApiError: class extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
  });
  vm.runInContext(`${js}\nassertStripeEventEnvironment(${JSON.stringify(livemode)});`, ctx);
};
let tests = 0;
for (const [env, mode] of [['test', false], ['live', true], [' LIVE ', true]]) {
  assert.doesNotThrow(() => run(env, { livemode: mode })); tests++;
}
for (const [env, payload, expectedCode] of [
  ['test', { livemode: true }, 'stripe_environment_mismatch'],
  ['live', { livemode: false }, 'stripe_environment_mismatch'],
  ['test', {}, 'stripe_environment_mismatch'],
  ['live', { livemode: 'true' }, 'stripe_environment_mismatch'],
  ['', { livemode: false }, 'invalid_stripe_environment'],
  ['production', { livemode: true }, 'invalid_stripe_environment'],
]) {
  assert.throws(() => run(env, payload), (err) => err.code === expectedCode); tests++;
}
assert(source.indexOf('assertStripeEventEnvironment(event);') > source.indexOf('if (!await verifyStripeSignature(raw, signature))'));
assert(source.indexOf('assertStripeEventEnvironment(event);') < source.indexOf('const admin = createAdminClient();', source.indexOf('Deno.serve(')));
tests += 2;
console.log(`PASS Phase 4.2.2 event mode guard and fail-closed config (${tests} checks)`);
