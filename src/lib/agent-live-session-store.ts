import type { AgentPairing } from './agent-pairing.ts';

const LIVE_AGENT_IDS_KEY = 'ezwrite-live-agent-pairing-ids';

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function readIds(storage: StorageLike): string[] {
  const raw = storage.getItem(LIVE_AGENT_IDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry ?? '')).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeIds(storage: StorageLike, ids: string[]): void {
  if (ids.length === 0) {
    storage.removeItem(LIVE_AGENT_IDS_KEY);
    return;
  }
  storage.setItem(LIVE_AGENT_IDS_KEY, JSON.stringify(ids));
}

export function getEnabledLiveSessionAgentIds(storage: StorageLike): string[] {
  return readIds(storage);
}

export function setLiveSessionAgentEnabled(storage: StorageLike, pairingId: string, enabled: boolean): string[] {
  const current = new Set(readIds(storage));
  if (enabled) current.add(pairingId);
  else current.delete(pairingId);
  const next = [...current];
  writeIds(storage, next);
  return next;
}

export function getEnabledLiveSessionAgents(pairings: AgentPairing[], storage: StorageLike): AgentPairing[] {
  const enabled = new Set(readIds(storage));
  return pairings.filter((pairing) => enabled.has(pairing.id));
}

export function isLiveSessionEnabledForAnyAgent(storage: StorageLike): boolean {
  return readIds(storage).length > 0;
}
