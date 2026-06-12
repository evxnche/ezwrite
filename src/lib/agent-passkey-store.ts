// Local cache of minted agent passkeys, keyed by pairing id, so the handoff
// instructions (which embed the passkey) can be re-copied at any time. The server
// only stores a HASH of the passkey and can never return it again, so this local
// copy is the only way to resurface it for a second hand-off (e.g. when a CLI
// agent forgets the passkey/url across sessions). It lives in the owner's own
// localStorage; the passkey is a low-entropy, write-only convenience credential
// already shown in plaintext at mint time.

const PASSKEY_STORE_KEY = 'ezwrite-agent-passkeys';

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function readAll(storage: StorageLike): Record<string, string> {
  const raw = storage.getItem(PASSKEY_STORE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [id, pk] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof pk === 'string' && pk) out[id] = pk;
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(storage: StorageLike, map: Record<string, string>): void {
  if (Object.keys(map).length === 0) {
    storage.removeItem(PASSKEY_STORE_KEY);
    return;
  }
  storage.setItem(PASSKEY_STORE_KEY, JSON.stringify(map));
}

export function saveAgentPasskey(storage: StorageLike, pairingId: string, passkey: string): void {
  const map = readAll(storage);
  map[pairingId] = passkey;
  writeAll(storage, map);
}

export function getAgentPasskey(storage: StorageLike, pairingId: string): string | null {
  return readAll(storage)[pairingId] ?? null;
}

export function getAgentPasskeyIds(storage: StorageLike): string[] {
  return Object.keys(readAll(storage));
}

export function removeAgentPasskey(storage: StorageLike, pairingId: string): void {
  const map = readAll(storage);
  if (!(pairingId in map)) return;
  delete map[pairingId];
  writeAll(storage, map);
}
