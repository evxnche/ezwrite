import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FRONTEND_ROOTS = [
  'src',
  'vite.config.ts',
];

const FORBIDDEN_SOURCE_PATTERNS: RegExp[] = [
  /\bSUPABASE_SERVICE_ROLE\b/,
  /\bSERVICE_ROLE\b/,
  /\bOPENAI_API_KEY\b/,
  /\bANTHROPIC_API_KEY\b/,
  /\bSTRIPE_SECRET\b/,
  /\bSECRET_KEY\b/,
  /\bPRIVATE_KEY\b/,
  /\bsk_live_[A-Za-z0-9]+\b/,
  /\bghp_[A-Za-z0-9]+\b/,
  /BEGIN (RSA|OPENSSH|EC) PRIVATE KEY/,
];

const ALLOWED_PUBLIC_ENV_NAMES = new Set([
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_LANDING_PAGE_URL',
  'MODE',
  'VERCEL_GIT_COMMIT_SHA',
  'GITHUB_SHA',
]);

function collectFiles(root: string): string[] {
  const absRoot = path.join(process.cwd(), root);
  const stat = fs.statSync(absRoot);
  if (stat.isFile()) return [absRoot];

  const results: string[] = [];
  for (const entry of fs.readdirSync(absRoot, { withFileTypes: true })) {
    const child = path.join(absRoot, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(path.relative(process.cwd(), child)));
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      results.push(child);
    }
  }
  return results;
}

test('frontend source only references approved public env vars and no obvious secret markers', () => {
  const files = FRONTEND_ROOTS.flatMap(collectFiles);
  const envVarRegex = /\b(?:import\.meta\.env|process\.env)\.([A-Z0-9_]+)/g;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');

    for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
      assert.equal(
        pattern.test(source),
        false,
        `${path.relative(process.cwd(), file)} matched forbidden secret pattern ${pattern}`,
      );
    }

    for (const match of source.matchAll(envVarRegex)) {
      const envName = match[1];
      assert.equal(
        ALLOWED_PUBLIC_ENV_NAMES.has(envName),
        true,
        `${path.relative(process.cwd(), file)} references unexpected env var ${envName}`,
      );
    }
  }
});
