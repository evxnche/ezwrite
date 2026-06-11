// "Connect an agent" UI inside Settings. Mints a two-word passkey the user hands
// to an AI agent (Poke, Claude Code, Codex, …), and lists/revokes existing ones.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Check, Copy, X } from 'lucide-react';
import {
  buildAgentHandoffInstructions,
  mintPairing,
  listPairings,
  probeAgentApiSetup,
  revokePairing,
  type AgentPairing,
  type AgentApiSetupStatus,
  type MintedPairing,
} from '@/lib/agent-pairing';

const PANEL_SURFACE = 'rounded-xl border border-border/60';

type Scope = 'active' | 'any';
const EXPIRY_OPTIONS: Array<{ label: string; minutes: number | null }> = [
  { label: '1 hour', minutes: 60 },
  { label: '24 hours', minutes: 60 * 24 },
  { label: 'never', minutes: null },
];

interface Props {
  accessToken?: string;
  userId?: string;
  syncConfigured?: boolean;
  syncUnlocked?: boolean;
  activeProjectId?: string | null;
  activeProjectTitle?: string;
}

function expiryLabel(expiresAt: string | null): string {
  if (!expiresAt) return 'no expiry';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return 'expires soon';
  if (hours < 48) return `expires in ${hours}h`;
  return `expires in ${Math.round(hours / 24)}d`;
}

export default function AgentPairingSection({
  accessToken,
  userId,
  syncConfigured,
  syncUnlocked,
  activeProjectId,
  activeProjectTitle,
}: Props) {
  const auth = useMemo(
    () => (accessToken && userId ? { accessToken, userId } : null),
    [accessToken, userId],
  );

  const [pairings, setPairings] = useState<AgentPairing[]>([]);
  const [label, setLabel] = useState('');
  const [scope, setScope] = useState<Scope>('any');
  const [expiryIdx, setExpiryIdx] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mintedPairing, setMintedPairing] = useState<MintedPairing | null>(null);
  const [copied, setCopied] = useState(false);
  const [setupStatus, setSetupStatus] = useState<AgentApiSetupStatus>({ ready: true, code: 'ready', message: '' });
  const [checkingSetup, setCheckingSetup] = useState(false);

  const refresh = useCallback(() => {
    if (!auth) return;
    listPairings(auth).then(setPairings).catch(() => { /* offline is fine */ });
  }, [auth]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    if (!syncUnlocked) {
      setSetupStatus({ ready: true, code: 'ready', message: '' });
      setCheckingSetup(false);
      return;
    }
    setCheckingSetup(true);
    probeAgentApiSetup()
      .then((status) => {
        if (!cancelled) setSetupStatus(status);
      })
      .finally(() => {
        if (!cancelled) setCheckingSetup(false);
      });
    return () => { cancelled = true; };
  }, [syncUnlocked]);

  if (!syncConfigured) return null;

  const handleMint = async () => {
    if (!auth) return;
    setBusy(true);
    setError('');
    setMintedPairing(null);
    try {
      const result = await mintPairing(auth, {
        label: label.trim() || undefined,
        targetProjectId: scope === 'active' ? (activeProjectId ?? null) : null,
        expiresInMinutes: EXPIRY_OPTIONS[expiryIdx].minutes,
      });
      setMintedPairing(result);
      setCopied(false);
      setLabel('');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create passkey');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!mintedPairing) return;
    try {
      const instructions = buildAgentHandoffInstructions({
        passkey: mintedPairing.passkey,
        label: mintedPairing.pairing.label,
        targetProjectId: mintedPairing.pairing.targetProjectId,
        targetProjectTitle: mintedPairing.pairing.targetProjectId === activeProjectId ? activeProjectTitle : undefined,
        expiresAt: mintedPairing.pairing.expiresAt,
      });
      await navigator.clipboard.writeText(instructions);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — user can select manually */ }
  };

  const handleRevoke = async (id: string) => {
    if (!auth) return;
    try {
      await revokePairing(auth, id);
      setPairings((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke');
    }
  };

  const mintDisabled = busy || checkingSetup || !setupStatus.ready;

  return (
    <div className="space-y-2">
      <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">agents</h3>
      <div className={`${PANEL_SURFACE} bg-muted/10 p-3 space-y-3`}>
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wider">
          <Bot size={13} />
          shared canvas
        </div>

        {!syncUnlocked ? (
          <div className="text-xs text-muted-foreground lowercase">
            sign in first (settings → sync), then reopen this to connect an agent
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground lowercase leading-relaxed">
              give an agent a passkey and it can write, edit, and create docs live — no password needed.
              it can't delete docs, and you can roll back any change. shared docs pass through the
              server unencrypted; revoke anytime.
            </p>

            {checkingSetup && (
              <div className="text-[10px] text-muted-foreground lowercase">
                checking shared-canvas setup…
              </div>
            )}

            {!checkingSetup && !setupStatus.ready && (
              <div className="text-[10px] text-destructive lowercase whitespace-pre-wrap">
                {setupStatus.message}
              </div>
            )}

            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="agent name (e.g. poke)"
              maxLength={60}
              disabled={busy}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-accent-foreground/50 disabled:opacity-50"
            />

            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span className="text-muted-foreground lowercase">scope</span>
              <button
                type="button"
                onClick={() => setScope('any')}
                className={`px-2 py-1 rounded-lg ${scope === 'any' ? 'bg-accent/20 text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                any doc
              </button>
              <button
                type="button"
                onClick={() => setScope('active')}
                disabled={!activeProjectId}
                title={activeProjectTitle}
                className={`px-2 py-1 rounded-lg truncate max-w-[10rem] ${scope === 'active' ? 'bg-accent/20 text-accent-foreground' : 'text-muted-foreground hover:text-foreground'} disabled:opacity-40`}
              >
                this doc only
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span className="text-muted-foreground lowercase">expires</span>
              <select
                value={expiryIdx}
                onChange={(e) => setExpiryIdx(Number(e.target.value))}
                className="rounded-lg border border-border bg-background px-2 py-1 font-mono text-[11px] outline-none"
                aria-label="passkey expiry"
              >
                {EXPIRY_OPTIONS.map((opt, i) => (
                  <option key={opt.label} value={i}>{opt.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleMint}
              disabled={mintDisabled}
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-accent/20 text-accent-foreground disabled:opacity-40"
            >
              {busy ? 'generating…' : checkingSetup ? 'checking…' : 'generate passkey'}
            </button>

            {mintedPairing && (
              <div className={`${PANEL_SURFACE} border-2 border-dashed border-accent-foreground/40 bg-accent/10 p-3 space-y-1.5`}>
                <div className="text-[10px] text-muted-foreground lowercase">give this to your agent — shown once:</div>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-base font-bold text-foreground tracking-wide select-all">{mintedPairing.passkey}</code>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono text-muted-foreground hover:text-foreground"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'copied instructions' : 'copy agent instructions'}
                  </button>
                </div>
                <div className="text-[10px] text-muted-foreground lowercase leading-relaxed">
                  copies the endpoint, passkey, notebook/page navigation notes, and usage steps your agent needs. keep this tab open to see edits arrive live.
                </div>
              </div>
            )}

            {pairings.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">active passkeys</div>
                {pairings.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-[11px] font-mono">
                    <span className="min-w-0 truncate text-foreground lowercase">
                      {p.label || 'agent'}
                      <span className="text-muted-foreground">
                        {' · '}{p.targetProjectId ? 'one doc' : 'any doc'}{' · '}{expiryLabel(p.expiresAt)}
                      </span>
                    </span>
                    <button
                      onClick={() => handleRevoke(p.id)}
                      className="flex items-center gap-1 text-muted-foreground hover:text-destructive"
                      aria-label={`revoke ${p.label || 'agent'} passkey`}
                    >
                      <X size={12} />
                      revoke
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="text-[10px] text-destructive lowercase break-all whitespace-pre-wrap">{error}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
