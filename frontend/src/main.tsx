import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from './Providers';
import { App } from './App';
import { installDesktopTransport } from './api/installDesktopTransport';

installDesktopTransport();

const host = document.getElementById('leos-app');
if (host) {
  createRoot(host).render(
    <StrictMode>
      <Providers>
        <App />
      </Providers>
    </StrictMode>,
  );
}
