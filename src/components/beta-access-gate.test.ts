import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

test('the closed-beta gate renders instead of the editor until access is granted', () => {
  const source = read('src/App.tsx');
  assert.match(source, /import BetaAccessGate from ["']\.\/components\/BetaAccessGate["']/);
  assert.match(source, /import \{ hasBetaAccess \} from ["']\.\/lib\/beta-access["']/);
  assert.match(source, /useState\(\(\) => hasBetaAccess\(\)\)/);
  assert.match(source, /<BetaAccessGate onUnlock=\{\(\) => setUnlocked\(true\)\}/);
});

test('BetaAccessGate matches the MobileSyncGate sign-in aesthetic', () => {
  const source = read('src/components/BetaAccessGate.tsx');
  assert.match(source, /min-h-screen bg-background flex items-center justify-center/);
  assert.match(source, /brand-title/);
  assert.match(source, /closed beta/);
  assert.match(source, /placeholder="access code"/);
});

test('codes are validated server-side via the Supabase redeem_beta_code RPC, not in the bundle', () => {
  const source = read('src/lib/beta-access.ts');
  assert.match(source, /rest\/v1\/rpc\/redeem_beta_code/);
  assert.match(source, /p_code/);
  assert.match(source, /VITE_SUPABASE_URL/);
  assert.match(source, /VITE_SUPABASE_ANON_KEY/);
  // no literal beta code should be hardcoded in the client
  assert.doesNotMatch(source, /const\s+\w*CODE\w*\s*=\s*['"]/i);
});

test('a granted access flag persists in localStorage so testers re-enter the code only once', () => {
  const source = read('src/lib/beta-access.ts');
  assert.match(source, /STORAGE_KEY = 'ezwrite-beta-access'/);
  assert.match(source, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(source, /localStorage\.setItem\(STORAGE_KEY/);
});
