import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  getBugReportConfigStatus,
  recordBugReportBreadcrumb,
  submitBugReport,
  type BugReportSource,
} from '@/lib/bug-report';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: BugReportSource;
  contactEmail?: string;
  accessToken?: string;
  userId?: string;
  bugContext?: Record<string, unknown>;
};

const BugReportDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  source,
  contactEmail: defaultEmail = '',
  accessToken,
  userId,
  bugContext,
}) => {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [successNote, setSuccessNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    recordBugReportBreadcrumb('opened bug report dialog', { source });
    setMessage('');
    setEmail(defaultEmail);
    setStatus('idle');
    setSuccessNote('');
    setError('');
  }, [open, defaultEmail, source]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    recordBugReportBreadcrumb('submitted bug report', {
      source,
      hasContactEmail: Boolean(email.trim()),
      messageLength: message.trim().length,
    });
    setStatus('submitting');
    setError('');
    try {
      const method = await submitBugReport({
        message,
        source,
        contactEmail: email,
        accessToken,
        userId,
        extra: bugContext,
      });
      setStatus('success');
      setSuccessNote(
        method === 'database'
          ? 'thanks — report received.'
          : 'opened your email app with the report draft.',
      );
      setMessage('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not send report';
      setStatus('error');
      setError(msg);
    }
  };

  const dbReady = getBugReportConfigStatus() === 'ready';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-md bg-popover text-popover-foreground !rounded-2xl font-mono text-sm">
        <DialogHeader>
          <DialogTitle className="font-mono text-base sm:text-lg lowercase">report a bug</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 lowercase">
          <div>
            <textarea
              id="bug-message"
              aria-label="what happened?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              required
              disabled={status === 'submitting' || status === 'success'}
              placeholder="steps to reproduce, what you expected, what you saw instead..."
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent-foreground/50 disabled:opacity-50 resize-y min-h-[120px] placeholder:text-popover-foreground placeholder:opacity-100"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bug-email" className="text-xs text-muted-foreground uppercase tracking-wider">
              email (optional)
            </label>
            <input
              id="bug-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === 'submitting' || status === 'success'}
              placeholder="so we can follow up"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent-foreground/50 disabled:opacity-50 placeholder:text-popover-foreground placeholder:opacity-100"
            />
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {dbReady
              ? 'notes content is not sent'
              : 'supabase is not configured — submit will open your email app instead.'}
          </p>
          {status === 'success' && successNote && (
            <p className="text-xs text-accent-foreground">{successNote}</p>
          )}
          {status === 'error' && error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground"
            >
              {status === 'success' ? 'close' : 'cancel'}
            </button>
            {status !== 'success' && (
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="px-3 py-1.5 rounded-lg text-xs bg-accent/20 text-accent-foreground disabled:opacity-40"
              >
                {status === 'submitting' ? 'sending...' : 'send report'}
              </button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default BugReportDialog;
