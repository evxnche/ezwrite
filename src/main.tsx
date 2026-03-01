import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

navigator.storage?.persist?.();

createRoot(document.getElementById("root")!).render(<App />);
