import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ProfileScreen } from './ProfileScreen';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element not found');
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
createRoot(rootElement).render(
  <StrictMode>
    <ProfileScreen userId="u1" />
  </StrictMode>,
);
