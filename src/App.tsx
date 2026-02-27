import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import WritingInterface from "./components/WritingInterface";

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <TooltipProvider>
      <WritingInterface />
    </TooltipProvider>
  </ThemeProvider>
);

export default App;
