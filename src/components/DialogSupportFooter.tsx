import React, { useState } from 'react';
import { BUG_REPORT_EMAIL } from '@/lib/bug-report';
import BugReportDialog from './BugReportDialog';

type Props = {
  variant: 'help' | 'settings';
  bugContext?: Record<string, string>;
  contactEmail?: string;
  accessToken?: string;
  userId?: string;
};

const DialogSupportFooter: React.FC<Props> = ({
  variant,
  bugContext,
  contactEmail,
  accessToken,
  userId,
}) => {
  const [bugOpen, setBugOpen] = useState(false);

  return (
    <>
      <div className="border-t border-border pt-3 mt-1 space-y-1.5 font-mono text-xs text-muted-foreground lowercase">
        <button
          type="button"
          onClick={() => setBugOpen(true)}
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
      <BugReportDialog
        open={bugOpen}
        onOpenChange={setBugOpen}
        source={variant}
        contactEmail={contactEmail}
        accessToken={accessToken}
        userId={userId}
        bugContext={bugContext}
      />
    </>
  );
};

export default DialogSupportFooter;
