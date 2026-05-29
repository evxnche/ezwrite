// MCP sync helpers — work with the file export directory directly
// No REST API needed; files are the source of truth.

import { writeMcpConfig, readMcpConfig } from '@/lib/storage';
import type { FileSystemDirectoryHandle } from '@/lib/storage';

const MCP_PORT = 3157;

export function getMcpUrl(token: string): string {
  return `http://localhost:${MCP_PORT}/mcp?token=${token}`;
}

export async function ensureMcpToken(dirHandle: FileSystemDirectoryHandle | null): Promise<string | null> {
  if (!dirHandle) return null;

  // Try reading existing token
  const existing = await readMcpConfig(dirHandle);
  if (existing) return existing.token;

  // Generate and write new token
  const token = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await writeMcpConfig(dirHandle, token);
  return token;
}

export async function readMcpToken(dirHandle: FileSystemDirectoryHandle | null): Promise<string | null> {
  if (!dirHandle) return null;
  const config = await readMcpConfig(dirHandle);
  return config?.token ?? null;
}
