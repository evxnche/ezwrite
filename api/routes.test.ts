import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('api/agent uses an explicit .js relative import for the shared handler', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'api/agent.ts'), 'utf8');
  assert.match(source, /from '\.\.\/lib\/agent-upstream\.js';/);
});

test('api/mcp uses deploy-safe .js imports for both shared handlers', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'api/mcp.ts'), 'utf8');
  assert.match(source, /from '\.\.\/lib\/agent-mcp\.js';/);
  assert.match(source, /from '\.\.\/lib\/agent-upstream\.js';/);
});

test('api/opencode uses a deploy-safe .js import for the shared relay', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'api/opencode.ts'), 'utf8');
  assert.match(source, /from '\.\.\/lib\/opencode-upstream\.js';/);
});

test('api/link-title stays self-contained without @vercel/node type imports', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'api/link-title.ts'), 'utf8');
  assert.equal(source.includes("@vercel/node"), false);
});
