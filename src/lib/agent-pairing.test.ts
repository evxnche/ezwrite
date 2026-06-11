import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildAgentHandoffInstructions,
  describeAgentApiFailure,
  probeAgentApiSetup,
  setAgentPairingEnvForTests,
} from './agent-pairing.ts';

test.afterEach(() => {
  delete (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
  setAgentPairingEnvForTests(null);
});

test('describeAgentApiFailure explains missing server env setup', () => {
  const message = describeAgentApiFailure(503, {
    error: 'Agent API not configured (missing server env: SUPABASE_SERVICE_ROLE_KEY / AGENT_PASSKEY_PEPPER).',
  });

  assert.match(message, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(message, /AGENT_PASSKEY_PEPPER/);
  assert.match(message, /restart the dev server or redeploy/i);
});

test('describeAgentApiFailure points missing agent tables at the SQL setup doc', () => {
  const message = describeAgentApiFailure(500, {
    error: "supabase 404: Could not find the table 'public.ezwrite_agent_pairings' in the schema cache",
  });

  assert.match(message, /docs\/supabase-agents\.sql/);
  assert.match(message, /shared canvas tables are missing/i);
});

test('probeAgentApiSetup detects builds that do not expose the agent route', async () => {
  globalThis.fetch = async () => new Response('<!doctype html><title>404</title>', {
    status: 404,
    headers: { 'Content-Type': 'text/html' },
  });

  const status = await probeAgentApiSetup();

  assert.deepEqual(status, {
    ready: false,
    code: 'route-missing',
    message: 'this build does not expose /api/agent. demo shared canvas from `npm run dev` or a deployed server build.',
  });
});

test('probeAgentApiSetup reports ready when the backend route responds', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ service: 'ezwrite agent api' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const status = await probeAgentApiSetup();

  assert.deepEqual(status, { ready: true, code: 'ready', message: '' });
});

test('buildAgentHandoffInstructions includes endpoint passkey and usage guidance', () => {
  const instructions = buildAgentHandoffInstructions({
    passkey: 'noble-lynx-96',
    label: 'claude',
    targetProjectId: 'doc-123',
    targetProjectTitle: 'biology notes',
    expiresAt: '2026-06-09T12:00:00.000Z',
  });

  assert.match(instructions, /https:\/\/ezwrite\.xyz\/api\/agent/);
  assert.match(instructions, /noble-lynx-96/);
  assert.match(instructions, /X-EZ-Passkey: noble-lynx-96/);
  assert.match(instructions, /\{"action":"list_projects"\}/);
  assert.match(instructions, /Passkey:\s*noble-lynx-96/);
  assert.match(instructions, /Expires:\s*2026-06-09T12:00:00.000Z\s*Scope:/);
  assert.match(instructions, /Scope:\s*one doc only \(biology notes\)/);
  assert.match(instructions, /A notebook is one document in the notebooks list\./);
  assert.match(instructions, /`read` returns that notebook title plus its `pages` array\./);
  assert.match(instructions, /Page numbering is zero-based.*`page: 0` is the first page.*`page: 1` is the second page\./);
  assert.match(instructions, /first try the hassle-free path: open https:\/\/ezwrite\.xyz and make the edit there with no extra setup\./);
  assert.match(instructions, /ask the user to set up the integration route below instead of guessing\./);
  assert.match(instructions, /Keep the owner's ezwrite tab open for live writes\./);
});

test('buildAgentHandoffInstructions gives Poke its supported MCP integration setup', () => {
  const instructions = buildAgentHandoffInstructions({
    passkey: 'tidy-acorn-33',
    label: 'poke',
    targetProjectId: null,
    expiresAt: '2026-06-12T18:35:35.740Z',
  });

  assert.match(instructions, /https:\/\/ezwrite\.xyz\/api\/mcp/);
  assert.match(instructions, /poke\.com\/integrations\/new/);
  assert.match(instructions, /API key:\s*tidy-acorn-33/);
  assert.match(instructions, /A notebook is one document in the notebooks list\./);
  assert.match(instructions, /first try the hassle-free path: open https:\/\/ezwrite\.xyz and make the edit there with no extra setup\./);
  assert.match(instructions, /When a user says "notebook", they mean a doc\./);
  assert.doesNotMatch(instructions, /Send POST requests to the endpoint/);
});

test('AgentPairingSection exposes a single copy-agent-instructions button after minting', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/AgentPairingSection.tsx'), 'utf8');
  assert.match(source, /buildAgentHandoffInstructions/);
  assert.match(source, /copy agent instructions/);
  assert.match(source, /notebook\/page navigation notes/);
});
