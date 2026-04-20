import { lazy, Suspense, useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import WritingInterface from "./components/WritingInterface";

const Analytics = lazy(() =>
  import("@vercel/analytics/react").then((module) => ({ default: module.Analytics })),
);
const UpdateBanner = lazy(() => import("./components/UpdateBanner"));

const App = () => {
  const [showDeferredUi, setShowDeferredUi] = useState(false);

  useEffect(() => {
    const schedule = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(callback, 1));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = schedule(() => setShowDeferredUi(true));
    return () => cancel(handle);
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        {showDeferredUi && (
          <Suspense fallback={null}>
            <UpdateBanner />
          </Suspense>
        )}
        <WritingInterface />
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
