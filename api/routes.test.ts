import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('api/agent uses an explicit .js relative import for the shared handler', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'api/agent.ts'), 'utf8');
  assert.match(source, /from '\.\.\/lib\/agent-upstream\.js';/);
});

test('api/link-title stays self-contained without @vercel/node type imports', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'api/link-title.ts'), 'utf8');
  assert.equal(source.includes("@vercel/node"), false);
});
