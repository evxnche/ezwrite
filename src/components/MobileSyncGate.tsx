import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
  username: string;
  password: string;
  busy?: boolean;
  error?: string;
  loading?: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSignIn: () => void;
  onCreateAccount: () => void;
}

// Full-screen sign-in shown on mobile web instead of the editor. Enforces that no
// writing is ever device-only on phones (where the browser can evict storage).
const MobileSyncGate: React.FC<Props> = ({
  username,
  password,
  busy = false,
  error = '',
  loading = false,
  onUsernameChange,
  onPasswordChange,
  onSignIn,
  onCreateAccount,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="font-mono text-xs text-muted-foreground animate-pulse">loading…</div>
      </div>
    );
  }

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
            ezwrite (on mobile) saves your writing to the cloud, as the mobile browsers wipe data.
          </p>
        </div>

        <div className="space-y-2">
          <input
            type="text"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder="username"
            disabled={busy}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-base outline-none focus:border-accent-foreground/50 disabled:opacity-50"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSignIn(); }}
              placeholder="password"
              disabled={busy}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-base outline-none focus:border-accent-foreground/50 disabled:opacity-50"
              style={{ fontSize: '16px' }}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              disabled={busy}
              aria-label={showPassword ? 'hide password' : 'show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {error && (
            <p className="font-mono text-xs text-destructive break-words whitespace-pre-wrap">{error}</p>
          )}
          <button
            onClick={onSignIn}
            disabled={busy}
            className="w-full rounded-lg bg-accent/20 px-3 py-2 font-mono text-sm text-accent-foreground disabled:opacity-40"
          >
            {busy ? 'signing in…' : 'sign in'}
          </button>
          <button
            onClick={onCreateAccount}
            disabled={busy}
            className="w-full rounded-lg px-3 py-2 font-mono text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            create account
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileSyncGate;
