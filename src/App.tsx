import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { Analytics } from "@vercel/analytics/react";
import WritingInterface from "./components/WritingInterface";
import UpdateBanner from "./components/UpdateBanner";
import InstallHint from "./components/InstallHint";

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <TooltipProvider>
      <UpdateBanner />
      <InstallHint />
      <WritingInterface />
      <Analytics />
    </TooltipProvider>
  </ThemeProvider>
);

export default App;
