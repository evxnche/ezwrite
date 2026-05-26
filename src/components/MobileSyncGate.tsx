import React from 'react';

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
          <h1 className="font-mono text-base text-foreground">sign in</h1>
          <p className="font-mono text-xs text-muted-foreground leading-relaxed">
            ezwrite (on mobiles) saves your writing to the cloud, as the mobile browsers wipe data.
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
          <input
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSignIn(); }}
            placeholder="password"
            disabled={busy}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent-foreground/50 disabled:opacity-50"
            style={{ fontSize: '16px' }}
          />
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
