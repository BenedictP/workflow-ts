import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Counter } from './Counter';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element not found');
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
createRoot(rootElement).render(
  <StrictMode>
    <Counter />
  </StrictMode>
);
