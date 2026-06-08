import test from 'node:test';
import assert from 'node:assert/strict';

import { handleAgentRequest, type AgentEnv } from './agent-upstream.ts';

const env: AgentEnv = {
  supabaseUrl: 'https://example.supabase.co',
  serviceRoleKey: 'service-role-key',
  anonKey: 'anon-key',
  passkeyPepper: 'pepper',
};

const activePairing = [{
  id: 'pair-1',
  user_id: 'user-1',
  label: 'cc',
  target_project_id: null,
  can_manage_projects: true,
  revoked: false,
  expires_at: null,
}];

test.afterEach(() => {
  delete (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
});

// PostgREST answers a `POST ... Prefer: return=minimal` with 201 and an EMPTY
// body. adminFetch must not try to JSON.parse that empty body, or every write
// op fails with "Unexpected end of JSON input".
test('write ops queue successfully when Supabase returns 201 with an empty body', async () => {
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (url.includes('ezwrite_agent_pairings') && method === 'GET') {
      return new Response(JSON.stringify(activePairing), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('ezwrite_agent_pairings') && method === 'PATCH') {
      return new Response(null, { status: 204 }); // last_used_at, fire-and-forget
    }
    if (url.includes('ezwrite_agent_events') && method === 'POST') {
      // return=minimal -> 201 Created, no body. This is what broke writes.
      return new Response(null, { status: 201 });
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  };

  const result = await handleAgentRequest(
    {
      method: 'POST',
      header: (name) => (name.toLowerCase() === 'x-ez-passkey' ? 'cozy-pebble-98' : undefined),
      body: { action: 'append', text: 'hello' },
    },
    env,
  );

  assert.deepEqual(result, { status: 200, body: { ok: true, queued: true, op: 'append' } });
});
