import React, { useState } from 'react';
import { redeemBetaCode } from '@/lib/beta-access';

interface Props {
  onUnlock: () => void;
}

// Full-screen closed-beta gate shown at first open, before the editor. Mirrors
// MobileSyncGate's layout/aesthetic so the two sign-in surfaces feel like one app.
const BetaAccessGate: React.FC<Props> = ({ onUnlock }) => {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const result = await redeemBetaCode(code);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    onUnlock();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-5">
        <div className="space-y-2 text-center">
          <span
            className="brand-title block text-foreground"
            style={{ letterSpacing: '-0.04em', fontFamily: "'Instrument Serif', serif", fontSize: '26px' }}
          >
            ezwrite.
          </span>
          <p className="font-mono text-xs text-muted-foreground leading-relaxed">
            ezwrite is in closed beta. enter your access code to continue.
          </p>
        </div>

        <div className="space-y-2">
          <input
            type="text"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="access code"
            disabled={busy}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-base outline-none focus:border-accent-foreground/50 disabled:opacity-50"
            style={{ fontSize: '16px' }}
          />
          {error && (
            <p className="font-mono text-xs text-destructive break-words whitespace-pre-wrap">{error}</p>
          )}
          <button
            onClick={submit}
            disabled={busy}
            className="w-full rounded-lg bg-accent/20 px-3 py-2 font-mono text-sm text-accent-foreground disabled:opacity-40"
          >
            {busy ? 'checking…' : 'enter'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BetaAccessGate;
