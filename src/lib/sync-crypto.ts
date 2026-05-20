const DEFAULT_PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface PasswordEncryptedPayload {
  version: 1;
  kdf: {
    name: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    salt: string;
  };
  cipher: {
    name: 'AES-GCM';
    iv: string;
  };
  ciphertext: string;
}

export interface SyncProjectSnapshot {
  schemaVersion: 1;
  projectId: string;
  title: string;
  pages: string[];
  scratchpad: string;
  updatedAt: number;
}

interface EncryptOptions {
  iterations?: number;
}

function getCrypto(): Crypto {
  const cryptoImpl = globalThis.crypto;
  if (!cryptoImpl?.subtle) {
    throw new Error('WebCrypto is not available in this environment');
  }
  return cryptoImpl;
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

function encodeBase64Url(bytes: Uint8Array): string {
  return encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function deriveAesKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  if (!password) throw new Error('Sync password is required');
  const cryptoImpl = getCrypto();
  const passwordKey = await cryptoImpl.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return cryptoImpl.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJsonWithPassword(
  value: unknown,
  password: string,
  options: EncryptOptions = {},
): Promise<PasswordEncryptedPayload> {
  const cryptoImpl = getCrypto();
  const salt = cryptoImpl.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = cryptoImpl.getRandomValues(new Uint8Array(IV_BYTES));
  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  const key = await deriveAesKey(password, salt, iterations);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await cryptoImpl.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    version: 1,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: encodeBase64(salt),
    },
    cipher: {
      name: 'AES-GCM',
      iv: encodeBase64(iv),
    },
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptJsonWithPassword<T>(
  payload: PasswordEncryptedPayload,
  password: string,
): Promise<T> {
  if (payload.version !== 1) throw new Error('Unsupported encrypted payload version');
  if (payload.kdf.name !== 'PBKDF2' || payload.kdf.hash !== 'SHA-256') {
    throw new Error('Unsupported encrypted payload KDF');
  }
  if (payload.cipher.name !== 'AES-GCM') {
    throw new Error('Unsupported encrypted payload cipher');
  }

  const cryptoImpl = getCrypto();
  const salt = decodeBase64(payload.kdf.salt);
  const iv = decodeBase64(payload.cipher.iv);
  const ciphertext = decodeBase64(payload.ciphertext);
  const key = await deriveAesKey(password, salt, payload.kdf.iterations);
  const plaintext = await cryptoImpl.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
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

export async function encryptProjectSnapshot(
  input: Parameters<typeof buildSyncProjectSnapshot>[0],
  password: string,
): Promise<PasswordEncryptedPayload> {
  return encryptJsonWithPassword(buildSyncProjectSnapshot(input), password);
}

export async function getSyncSpaceId(password: string): Promise<string> {
  if (!password) throw new Error('Sync password is required');
  const cryptoImpl = getCrypto();
  const digest = await cryptoImpl.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`ezwrite-sync-space-v1:${password}`),
  );
  return encodeBase64Url(new Uint8Array(digest));
}

export async function hashEncryptedPayload(payload: PasswordEncryptedPayload): Promise<string> {
  const cryptoImpl = getCrypto();
  const digest = await cryptoImpl.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return encodeBase64Url(new Uint8Array(digest));
}
