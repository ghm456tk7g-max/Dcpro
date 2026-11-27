import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/800.css';
import './index.css';
import App from './App';
import { LeagueProvider } from './lib/league';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LeagueProvider>
      <App />
    </LeagueProvider>
  </React.StrictMode>,
);

// Service Worker nur im Produktions-Build (sonst stört er das Hot-Reload)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
