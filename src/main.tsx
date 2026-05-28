import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { installBugReportDiagnostics, recordBugReportBreadcrumb } from './lib/bug-report'
import './index.css'

const isLocalDevHost = typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

if (isLocalDevHost && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch(() => {});

  if ('caches' in window) {
    void caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => {});
  }
}

navigator.storage?.persist?.();
installBugReportDiagnostics();
recordBugReportBreadcrumb('app started');

createRoot(document.getElementById("root")!).render(<App />);
