// Entry point for the Work Queue webview React app.
// Mounts into the #root div provided by the extension's HTML shell.

import { createRoot } from 'react-dom/client';
import 'reactflow/dist/style.css';
import App from './App';

// Prevent VS Code from intercepting bare keypresses (numbers, letters)
// that can trigger editor commands and crash the webview rendering.
document.addEventListener('keydown', (e) => {
  // Allow modifier combos (Ctrl+C, Ctrl+V, etc.) to pass through
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  // Only block single-char keys that VS Code might steal
  if (e.key.length === 1 && !e.key.match(/\s/)) {
    e.stopPropagation();
  }
}, true);

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
