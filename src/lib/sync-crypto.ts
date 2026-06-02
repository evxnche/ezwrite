// End-to-end sync crypto.
//
// One user passphrase + username derives TWO independent secrets via PBKDF2 with
// distinct salts:
//   - authSecret   -> sent to Supabase as the account password (server sees only this)
//   - masterKey    -> stays on device, used to encrypt note payloads
// The server therefore never receives the value used to derive the encryption key.
//
// Each note payload (v2) gets a fresh random salt; the per-note AES-GCM key is
// derived from the master key with HKDF (cheap), so PBKDF2 runs once per session,
// not once per note.

const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedNotePayload {
  version: 2;
  salt: string;      // base64, HKDF salt (per note)
  iv: string;        // base64, AES-GCM iv
  ciphertext: string; // base64
}

export interface SyncProjectSnapshot {
  schemaVersion: 1;
  projectId: string;
  title: string;
  pages: string[];
  scratchpad: string;
  updatedAt: number;
}

function getCrypto(): Crypto {
  const cryptoImpl = globalThis.crypto;
  if (!cryptoImpl?.subtle) {
    throw new Error('WebCrypto is not available in this environment');
  }
  return cryptoImpl;
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof btoa !== 'function') throw new Error('Base64 encoder is not available');
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  if (typeof atob !== 'function') throw new Error('Base64 decoder is not available');
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
  return encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function deterministicSalt(scope: string, username: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(`ezwrite:${scope}:${normalizeUsername(username)}`);
  const digest = await getCrypto().subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

async function pbkdf2Bits(password: string, salt: Uint8Array, bits = 256): Promise<ArrayBuffer> {
  if (!password) throw new Error('Sync password is required');
  const cryptoImpl = getCrypto();
  const passwordKey = await cryptoImpl.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return cryptoImpl.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    passwordKey,
    bits,
  );
}

// Value sent to Supabase as the account password. Derived so it cannot be used to
// reconstruct the encryption key without brute-forcing the passphrase offline.
export async function deriveAuthSecret(password: string, username: string): Promise<string> {
  const salt = await deterministicSalt('auth', username);
  const bits = await pbkdf2Bits(password, salt, 256);
  return toBase64Url(new Uint8Array(bits));
}

// HKDF base key for note encryption. Never leaves the device.
export async function deriveMasterKey(password: string, username: string): Promise<CryptoKey> {
  const salt = await deterministicSalt('enc', username);
  const bits = await pbkdf2Bits(password, salt, 256);
  return getCrypto().subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
}

async function deriveNoteKey(masterKey: CryptoKey, salt: Uint8Array): Promise<CryptoKey> {
  return getCrypto().subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('ezwrite-note-v2') },
    masterKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function buildSyncProjectSnapshot(input: {
  projectId: string;
  title: string;
  pages: string[];
  scratchpad?: string;
  updatedAt?: number;
}): SyncProjectSnapshot {
  return {
    schemaVersion: 1,
    projectId: input.projectId,
    title: input.title,
    pages: input.pages.map((page) => String(page ?? '')),
    scratchpad: input.scratchpad ?? '',
    updatedAt: input.updatedAt ?? Date.now(),
  };
}

export async function encryptSnapshotWithKey(
  snapshot: SyncProjectSnapshot,
  masterKey: CryptoKey,
): Promise<EncryptedNotePayload> {
  const cryptoImpl = getCrypto();
  const salt = cryptoImpl.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = cryptoImpl.getRandomValues(new Uint8Array(IV_BYTES));
  const noteKey = await deriveNoteKey(masterKey, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
  const ciphertext = await cryptoImpl.subtle.encrypt({ name: 'AES-GCM', iv }, noteKey, plaintext);
  return {
    version: 2,
    salt: encodeBase64(salt),
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptSnapshotWithKey<T>(
  payload: EncryptedNotePayload,
  masterKey: CryptoKey,
): Promise<T> {
  if (payload.version !== 2) throw new Error('Unsupported encrypted payload version');
  const cryptoImpl = getCrypto();
  const salt = decodeBase64(payload.salt);
  const iv = decodeBase64(payload.iv);
  const ciphertext = decodeBase64(payload.ciphertext);
  const noteKey = await deriveNoteKey(masterKey, salt);
  const plaintext = await cryptoImpl.subtle.decrypt({ name: 'AES-GCM', iv }, noteKey, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

// Stable hash of the sync-relevant notebook content (unlike ciphertext, which is salted
// per write). `updatedAt` is intentionally excluded so two devices with identical note
// content do not manufacture conflicts just because they saved at different times.
export async function hashSnapshot(snapshot: SyncProjectSnapshot): Promise<string> {
  const comparableSnapshot = {
    schemaVersion: snapshot.schemaVersion,
    projectId: snapshot.projectId,
    title: snapshot.title,
    pages: snapshot.pages,
    scratchpad: snapshot.scratchpad,
  };
  const digest = await getCrypto().subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(comparableSnapshot)),
  );
  return toBase64Url(new Uint8Array(digest));
}
