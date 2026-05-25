import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { installBugReportDiagnostics, recordBugReportBreadcrumb } from './lib/bug-report'
import './index.css'

navigator.storage?.persist?.();
installBugReportDiagnostics();
recordBugReportBreadcrumb('app started');

createRoot(document.getElementById("root")!).render(<App />);
