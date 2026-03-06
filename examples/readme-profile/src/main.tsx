import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ProfileScreen } from './ProfileScreen';

const rootElement = (
  globalThis as {
    readonly document?: { getElementById: (id: string) => HTMLElement | null };
  }
).document?.getElementById('root') ?? null;
if (rootElement === null) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ProfileScreen userId="u1" />
  </StrictMode>,
);
