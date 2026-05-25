import React from 'react';
import { BUG_REPORT_EMAIL, openBugReport } from '@/lib/bug-report';

type Props = {
  variant: 'help' | 'settings';
  bugContext?: Record<string, string>;
};

const DialogSupportFooter: React.FC<Props> = ({ variant, bugContext }) => (
  <div className="border-t border-border pt-3 mt-1 space-y-1.5 font-mono text-xs text-muted-foreground lowercase">
    <button
      type="button"
      onClick={() => openBugReport(bugContext)}
      className="block text-accent-foreground hover:underline transition-colors"
    >
      report a bug
    </button>
    {variant === 'help' ? (
      <p>
        dev hotline{' '}
        <a href={`mailto:${BUG_REPORT_EMAIL}`} className="text-accent-foreground hover:underline">
          {BUG_REPORT_EMAIL}
        </a>
      </p>
    ) : (
      <p>ezwrite · built by evan :)</p>
    )}
  </div>
);

export default DialogSupportFooter;
