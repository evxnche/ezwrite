import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import {
  decryptSnapshotWithKey,
  deriveAuthSecret,
  deriveMasterKey,
  normalizeUsername,
  type EncryptedNotePayload,
  type SyncProjectSnapshot,
} from '../src/lib/sync-crypto';

const ENV_PATH = path.join(process.cwd(), '.env.local');
const SYNC_STATUS_TIMEOUT_MS = 30_000;
const SYNC_DEBOUNCE_WAIT_MS = 2_600;

interface LocalEnv {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
}

interface RemoteSyncNote {
  encrypted_payload: EncryptedNotePayload;
  deleted: boolean;
  payload_hash: string;
  project_id: string;
  updated_at: number;
  user_id: string;
}

interface SyncApiSession {
  accessToken: string;
  masterKey: CryptoKey;
  userId: string;
}

const localEnv = readLocalEnv();

function readLocalEnv(): LocalEnv {
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

  const url = pairs.VITE_SUPABASE_URL;
  const anonKey = pairs.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
  }

  return {
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: anonKey,
  };
}

function getSupabaseHeaders(accessToken?: string, extra: Record<string, string> = {}): HeadersInit {
  return {
    apikey: localEnv.VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken ?? localEnv.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body || response.statusText}`);
  }
  return body ? JSON.parse(body) as T : undefined as T;
}

async function createApiSession(username: string, password: string): Promise<SyncApiSession> {
  const normalizedUsername = normalizeUsername(username);
  const authSecret = await deriveAuthSecret(password, normalizedUsername);
  const auth = await requestJson<{
    access_token?: string;
    user?: { id?: string };
  }>(
    `${localEnv.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: getSupabaseHeaders(),
      body: JSON.stringify({
        email: `${normalizedUsername}@ezwrite.local`,
        password: authSecret,
      }),
    },
  );

  if (!auth.access_token || !auth.user?.id) {
    throw new Error('Could not create API sync session');
  }

  return {
    accessToken: auth.access_token,
    masterKey: await deriveMasterKey(password, normalizedUsername),
    userId: auth.user.id,
  };
}

async function fetchRemoteSnapshot(session: SyncApiSession, projectId: string): Promise<SyncProjectSnapshot> {
  const rows = await requestJson<RemoteSyncNote[]>(
    `${localEnv.VITE_SUPABASE_URL}/rest/v1/ezwrite_user_sync_notes?select=user_id,project_id,encrypted_payload,payload_hash,updated_at,deleted&project_id=eq.${projectId}&deleted=is.false&order=updated_at.desc&limit=1`,
    {
      method: 'GET',
      headers: getSupabaseHeaders(session.accessToken),
    },
  );

  if (!rows.length) {
    throw new Error(`No remote sync row found for project ${projectId}`);
  }

  return decryptSnapshotWithKey<SyncProjectSnapshot>(rows[0].encrypted_payload, session.masterKey);
}

async function deleteRemoteProject(session: SyncApiSession, projectId: string): Promise<void> {
  await requestJson(
    `${localEnv.VITE_SUPABASE_URL}/rest/v1/ezwrite_user_sync_notes?user_id=eq.${session.userId}&project_id=eq.${projectId}`,
    {
      method: 'PATCH',
      headers: getSupabaseHeaders(session.accessToken, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ deleted: true, client_updated_at: Date.now() }),
    },
  );
}

async function openSettingsStorage(page: Page): Promise<void> {
  await page.getByLabel('Open notebooks').click();
  await expect(page.getByRole('button', { name: 'settings' })).toBeVisible();
  await page.getByRole('button', { name: 'settings' }).click();
  await expect(page.getByText('settings', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'storage' }).click();
  await expect(page.getByText('sync', { exact: true })).toBeVisible();
}

async function closeModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByText('settings', { exact: true })).toHaveCount(0);
}

async function createSyncAccount(page: Page, username: string, password: string): Promise<void> {
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'create' }).click();
  await waitForSyncStatus(page, 'synced');
  await expect(page.getByText(username, { exact: true })).toBeVisible();
}

async function signInToSync(page: Page, username: string, password: string): Promise<void> {
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'sign in' }).click();
  await waitForSyncStatus(page, 'synced');
}

async function waitForSyncStatus(page: Page, status: string): Promise<void> {
  const statusText = page.locator('span.text-\\[10px\\].text-muted-foreground.lowercase').first();
  await expect(statusText).toHaveText(status, { timeout: SYNC_STATUS_TIMEOUT_MS });
}

async function ensureDocSynced(page: Page): Promise<void> {
  const syncButton = page.getByRole('button', { name: /sync current doc|current doc synced/ });
  const label = (await syncButton.innerText()).trim();
  if (label === 'sync current doc') {
    await syncButton.click();
  }
  await expect(page.getByRole('button', { name: 'current doc synced' })).toBeVisible({
    timeout: SYNC_STATUS_TIMEOUT_MS,
  });
  await waitForSyncStatus(page, 'synced');
}

async function createUniqueDoc(page: Page, docTitle: string, seedText: string): Promise<void> {
  await page.getByLabel('Open notebooks').click();
  await page.getByRole('button', { name: 'notebooks', exact: true }).click();
  await page.getByLabel('New notebook').click();
  await page.getByLabel('Close drawer').click();

  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(`${docTitle}\n${seedText}`);
  await expect(editor).toContainText(docTitle);
  await page.waitForTimeout(SYNC_DEBOUNCE_WAIT_MS);
}

async function appendEditorText(page: Page, value: string): Promise<void> {
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible();
  await editor.click();
  await editor.evaluate((element) => {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.insertText(`\n${value}`);
  await page.waitForTimeout(SYNC_DEBOUNCE_WAIT_MS);
}

async function selectDocByTitle(page: Page, docTitle: string): Promise<void> {
  await page.getByLabel('Open notebooks').click();
  await page.getByRole('button', { name: 'notebooks', exact: true }).click();
  await expect(page.getByText(docTitle, { exact: true })).toBeVisible({
    timeout: SYNC_STATUS_TIMEOUT_MS,
  });
  await page.getByText(docTitle, { exact: true }).click();
}

async function getActiveProjectId(page: Page): Promise<string> {
  const projectId = await page.evaluate(() => localStorage.getItem('ezwrite-active-project'));
  if (!projectId) throw new Error('Missing active project id in localStorage');
  return projectId;
}

function attachConsoleWatch(page: Page, consoleErrors: string[], pageErrors: string[]): void {
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('ERR_INTERNET_DISCONNECTED')) return;
    if (text.includes('WebKit encountered an internal error')) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });
}

function assertNoUnexpectedErrors(consoleErrors: string[], pageErrors: string[]): void {
  expect(
    {
      consoleErrors,
      pageErrors,
    },
  ).toEqual({
    consoleErrors: [],
    pageErrors: [],
  });
}

test('sync survives offline edits and restores in a fresh browser session', async ({ browser, browserName, page, context }) => {
  const runId = `${browserName}-${Date.now().toString(36)}`;
  const username = `sync${runId}`.slice(0, 24);
  const password = `pw-${runId}-safe`;
  const docTitle = `doc-${browserName.slice(0, 3)}-${Date.now().toString(36).slice(-4)}`;
  const seedText = `seed-${runId}`;
  const offlineMarker = `offline-${runId}`;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  attachConsoleWatch(page, consoleErrors, pageErrors);

  await page.goto('/');
  await expect(page).toHaveTitle(/ez/i);
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible();

  await openSettingsStorage(page);
  await createSyncAccount(page, username, password);
  await closeModal(page);

  await createUniqueDoc(page, docTitle, seedText);

  await openSettingsStorage(page);
  await ensureDocSynced(page);
  await closeModal(page);

  const projectId = await getActiveProjectId(page);

  await context.setOffline(true);
  await appendEditorText(page, offlineMarker);
  await openSettingsStorage(page);
  await waitForSyncStatus(page, 'sync failed');
  await closeModal(page);

  await context.setOffline(false);
  await openSettingsStorage(page);
  await waitForSyncStatus(page, 'synced');
  await closeModal(page);

  const apiSession = await createApiSession(username, password);
  const remoteSnapshot = await fetchRemoteSnapshot(apiSession, projectId);
  expect(remoteSnapshot.title).toBe(docTitle);
  expect(remoteSnapshot.pages.join('\n')).toContain(offlineMarker);

  const secondContext: BrowserContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  const secondConsoleErrors: string[] = [];
  const secondPageErrors: string[] = [];
  attachConsoleWatch(secondPage, secondConsoleErrors, secondPageErrors);

  await secondPage.goto('/');
  await openSettingsStorage(secondPage);
  await signInToSync(secondPage, username, password);
  await closeModal(secondPage);
  await selectDocByTitle(secondPage, docTitle);
  await expect(secondPage.locator('[contenteditable="true"]').first()).toContainText(offlineMarker);

  assertNoUnexpectedErrors(consoleErrors, pageErrors);
  assertNoUnexpectedErrors(secondConsoleErrors, secondPageErrors);

  await secondContext.close();
  await deleteRemoteProject(apiSession, projectId);
});
