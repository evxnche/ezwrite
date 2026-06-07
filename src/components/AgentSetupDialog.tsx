// Hidden agent setup window, summoned by typing the //agent// cheat code in the
// editor. Keeps the whole feature inconspicuous: it never appears in Settings, so
// regular users never see it — only someone who knows the code can open it.

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AgentPairingSection from './AgentPairingSection';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken?: string;
  userId?: string;
  syncConfigured?: boolean;
  syncUnlocked?: boolean;
  activeProjectId?: string | null;
  activeProjectTitle?: string;
}

export default function AgentSetupDialog({
  open,
  onOpenChange,
  accessToken,
  userId,
  syncConfigured,
  syncUnlocked,
  activeProjectId,
  activeProjectTitle,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-md max-h-[82vh] overflow-y-auto bg-popover text-popover-foreground !rounded-2xl font-mono text-sm">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm lowercase">connect an agent</DialogTitle>
        </DialogHeader>
        <AgentPairingSection
          accessToken={accessToken}
          userId={userId}
          syncConfigured={syncConfigured}
          syncUnlocked={syncUnlocked}
          activeProjectId={activeProjectId}
          activeProjectTitle={activeProjectTitle}
        />
      </DialogContent>
    </Dialog>
  );
}
