import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

const UpdateBanner: React.FC = () => {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const checkForUpdate = () => {
        if (registration.installing || !navigator.onLine) return;
        void registration.update();
      };

      // Poll while the app stays open (default only checks on page load).
      setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

      // Also check when the user returns to the tab/PWA.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    },
  });

  if (!needRefresh) return null;

  const handleUpdate = () => {
    // updateServiceWorker(true) sends SKIP_WAITING and reloads once the new
    // worker takes control (on `controllerchange`). Don't reset state first —
    // let the swap drive the reload so we always land on the new build.
    void updateServiceWorker(true);
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
