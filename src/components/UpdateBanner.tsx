import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UpdateBanner: React.FC = () => {
  const { needRefresh: [needRefresh], registration } = useRegisterSW();

  if (!needRefresh) return null;

  const handleUpdate = () => {
    const reg = registration?.active ? registration : null;
    const waiting = registration?.waiting;
    if (waiting) {
      // Wait for the new SW to take control before reloading.
      // On iOS Safari, reloading immediately after postMessage doesn't work —
      // the page reloads before the new SW is active, so nothing updates.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      }, { once: true });
      waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] flex justify-center px-4 pt-3 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 bg-popover text-popover-foreground font-mono text-xs px-4 py-2.5 rounded-xl shadow-md border border-border opacity-95">
        <span className="text-muted-foreground lowercase">update available</span>
        <button
          onClick={handleUpdate}
          className="text-accent-foreground hover:underline lowercase"
        >
          tap to refresh
        </button>
      </div>
    </div>
  );
};

export default UpdateBanner;
