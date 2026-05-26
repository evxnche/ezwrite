import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { deriveAuthSecret, normalizeUsername } from '../src/lib/sync-crypto';

const ENV_PATH = path.join(process.cwd(), '.env.local');
const TIMEOUT = 30_000;
const GATE_TEXT = 'saves your writing to the cloud';

function readEnv(): { url: string; anonKey: string } {
  const text = fs.readFileSync(ENV_PATH, 'utf8');
  const pairs = Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith('#'))
      .map((line) => {
        const equals = line.indexOf('=');
        return [line.slice(0, equals), line.slice(equals + 1)];
      }),
  );
  if (!pairs.VITE_SUPABASE_URL || !pairs.VITE_SUPABASE_ANON_KEY) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
  }
  return { url: pairs.VITE_SUPABASE_URL, anonKey: pairs.VITE_SUPABASE_ANON_KEY };
}

const env = readEnv();

// Reads the persisted session straight out of IndexedDB to confirm sign-in survives reloads.
async function sessionPersisted(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const req = indexedDB.open('ezwrite-sync-session', 1);
        req.onsuccess = () => {
          try {
            const db = req.result;
            const getReq = db.transaction('session', 'readonly').objectStore('session').get('current');
            getReq.onsuccess = () => resolve(Boolean(getReq.result));
            getReq.onerror = () => resolve(false);
          } catch {
            resolve(false);
          }
        };
        req.onerror = () => resolve(false);
      }),
  );
}

async function cleanupAccount(username: string, password: string): Promise<void> {
  try {
    const normalized = normalizeUsername(username);
    const authSecret = await deriveAuthSecret(password, normalized);
    const authRes = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${normalized}@ezwrite.local`, password: authSecret }),
    });
    const auth = (await authRes.json().catch(() => ({}))) as { access_token?: string; user?: { id?: string } };
    if (!auth.access_token || !auth.user?.id) return;
    await fetch(`${env.url}/rest/v1/ezwrite_user_sync_notes?user_id=eq.${auth.user.id}`, {
      method: 'PATCH',
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${auth.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ deleted: true, client_updated_at: Date.now() }),
    });
  } catch {
    // best-effort cleanup
  }
}

test('desktop is not gated — editor loads without signing in', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible();
  await expect(page.getByText(GATE_TEXT)).toHaveCount(0);
});

test('mobile (?mobile=1) blocks writing behind the sign-in gate', async ({ page }) => {
  await page.goto('/?mobile=1');
  await expect(page.getByText(GATE_TEXT)).toBeVisible();
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
});

test('mobile sign-in through the gate persists across a reload', async ({ page, browserName }) => {
  const runId = `${browserName}-${Date.now().toString(36)}`;
  const username = `gate${runId}`.slice(0, 24);
  const password = `pw-${runId}-safe`;

  await page.goto('/?mobile=1');
  await expect(page.getByText(GATE_TEXT)).toBeVisible();

  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'create account' }).click();

  // Gate clears, editor mounts.
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible({ timeout: TIMEOUT });
  await expect(page.getByText(GATE_TEXT)).toHaveCount(0);

  // Session must be persisted before we test reload-survival.
  await expect.poll(() => sessionPersisted(page), { timeout: TIMEOUT }).toBe(true);

  await page.reload();
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible({ timeout: TIMEOUT });
  await expect(page.getByText(GATE_TEXT)).toHaveCount(0);

  await cleanupAccount(username, password);
});
