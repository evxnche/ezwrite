import React from 'react';
import { BUG_REPORT_EMAIL, openBugReport } from '@/lib/bug-report';

type Props = {
  variant: 'help' | 'settings';
  bugContext?: Record<string, string>;
};

const DialogSupportFooter: React.FC<Props> = ({ variant, bugContext }) => (
  <div className="border-t border-border pt-3 mt-1">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground lowercase">
      {variant === 'help' ? (
        <span>
          dev hotline{' '}
          <a href={`mailto:${BUG_REPORT_EMAIL}`} className="text-accent-foreground hover:underline">
            {BUG_REPORT_EMAIL}
          </a>
        </span>
      ) : (
        <span>ezwrite · built by evan :)</span>
      )}
      <span className="text-muted-foreground/50" aria-hidden>
        ·
      </span>
      <button
        type="button"
        onClick={() => openBugReport(bugContext)}
        className="text-accent-foreground hover:underline transition-colors"
      >
        report a bug
      </button>
    </div>
  </div>
);

export default DialogSupportFooter;
