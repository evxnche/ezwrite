import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { Analytics } from "@vercel/analytics/react";
import WritingInterface from "./components/WritingInterface";

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <TooltipProvider>
      <WritingInterface />
      <Analytics />
    </TooltipProvider>
  </ThemeProvider>
);

export default App;
