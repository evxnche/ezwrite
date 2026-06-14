import { lazy, Suspense, useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import WritingInterface from "./components/WritingInterface";
import UpdateBanner from "./components/UpdateBanner";
import BetaAccessGate from "./components/BetaAccessGate";
import { hasBetaAccess, shouldBypassBetaAccess } from "./lib/beta-access";

const Analytics = lazy(() =>
  import("@vercel/analytics/react").then((module) => ({ default: module.Analytics })),
);

const App = () => {
  const [unlocked, setUnlocked] = useState(
    () => shouldBypassBetaAccess(window.location.hostname) || hasBetaAccess(),
  );
  const [showDeferredUi, setShowDeferredUi] = useState(false);

  useEffect(() => {
    const schedule = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(callback, 1));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = schedule(() => setShowDeferredUi(true));
    return () => cancel(handle);
  }, []);

  useEffect(() => {
    const state = { ezwriteStayHere: true };
    window.history.replaceState(state, '', window.location.href);
    window.history.pushState(state, '', window.location.href);

    const blockBackNavigation = () => {
      window.history.pushState(state, '', window.location.href);
    };

    window.addEventListener('popstate', blockBackNavigation);
    return () => window.removeEventListener('popstate', blockBackNavigation);
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        {unlocked ? (
          <>
            <UpdateBanner />
            <WritingInterface />
          </>
        ) : (
          <BetaAccessGate onUnlock={() => setUnlocked(true)} />
        )}
        {showDeferredUi && (
          <Suspense fallback={null}>
            <Analytics />
          </Suspense>
        )}
      </TooltipProvider>
    </ThemeProvider>
  );
};

export default App;
