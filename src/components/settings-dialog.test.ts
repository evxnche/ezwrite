import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('scratchpad BYOK settings offer explicit Groq/custom provider guidance', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/SettingsDialog.tsx'), 'utf8');

  assert.match(source, /<option value="groq">groq<\/option>/);
  assert.match(source, /<option value="openrouter">openrouter<\/option>/);
  assert.match(source, /<option value="opencode">opencode zen<\/option>/);
  assert.match(source, />byok<\/h3>/);
  assert.match(source, /custom openai-compatible \(enter base url \+ model\)/);
  assert.equal(source.includes('openai-compatible (openai / groq / together / openrouter...)'), false);
  assert.equal(source.includes('base url (optional — defaults per provider)'), false);
  assert.equal(source.includes('scratchpad ai — byok'), false);
  assert.equal(source.includes('openrouter key is optional. leave model blank to use ezwrite fallback.'), false);
});
