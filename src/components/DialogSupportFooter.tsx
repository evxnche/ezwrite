import React, { useState } from 'react';
import { BRANDING_LINE } from '@/lib/app-links';
import BugReportDialog from './BugReportDialog';

type Props = {
  variant: 'help' | 'settings';
  bugContext?: Record<string, unknown>;
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
        <p>{BRANDING_LINE}</p>
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
