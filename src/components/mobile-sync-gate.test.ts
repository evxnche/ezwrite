import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

test('mobile sign-in gate renders instead of the editor on touch devices when signed out', () => {
  const source = read('src/components/WritingInterface.tsx');
  assert.match(source, /import MobileSyncGate from '\.\/MobileSyncGate'/);
  assert.match(source, /if \(isTouchDevice && syncConfigured && !syncSession\)/);
  assert.match(source, /<MobileSyncGate/);
});

test('?mobile=1 forces the mobile experience for local demos', () => {
  const source = read('src/components/WritingInterface.tsx');
  assert.match(source, /get\('mobile'\) === '1'/);
});

test('sign-in is restored on mount, persisted after sync, and cleared on sign out', () => {
  const source = read('src/components/WritingInterface.tsx');
  assert.match(source, /loadSyncSession\(\)/);
  assert.match(source, /void saveSyncSession\(session\)/);
  assert.match(source, /void clearSyncSession\(\)/);
});

test('mobile enables sync for every project so nothing stays device-only', () => {
  const source = read('src/components/WritingInterface.tsx');
  assert.match(source, /const enableSyncForAllLocalProjects = useCallback/);
  assert.match(source, /if \(isTouchDevice\) enableSyncForAllLocalProjects\(\)/);
});

test('sync-session-store persists the session in IndexedDB', () => {
  const source = read('src/lib/sync-session-store.ts');
  assert.match(source, /const DB_NAME = 'ezwrite-sync-session'/);
  assert.match(source, /indexedDB\.open\(/);
  assert.match(source, /export async function saveSyncSession/);
  assert.match(source, /export async function loadSyncSession/);
  assert.match(source, /export async function clearSyncSession/);
});

test('MobileSyncGate offers sign in + create account and a restore loading state', () => {
  const source = read('src/components/MobileSyncGate.tsx');
  assert.match(source, /Sign in to write on mobile/);
  assert.match(source, /onSignIn/);
  assert.match(source, /onCreateAccount/);
  assert.match(source, /loading/);
});

test('SettingsDialog hides the per-doc sync toggle on mobile', () => {
  const source = read('src/components/SettingsDialog.tsx');
  assert.match(source, /forceSyncAll/);
  assert.match(source, /all docs sync on mobile/);
});
