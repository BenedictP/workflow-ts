// README_SNIPPET_START: react
import { useWorkflow } from '@workflow-ts/react';
import type { JSX } from 'react';

import { profileWorkflow } from './workflow';

export function ProfileScreen({ userId }: { userId: string }): JSX.Element {
  const rendering = useWorkflow(
    profileWorkflow,
    { userId },
    (output) => {
      switch (output.type) {
        case 'closed':
          console.log('Profile flow closed');
          break;
      }
    },
  );

  switch (rendering.type) {
    case 'loading':
      return (
        <section>
          <h1>Profile</h1>
          <p>Loading...</p>
          <button onClick={rendering.close}>Close</button>
        </section>
      );
    case 'loaded':
      return (
        <section>
          <h1>Welcome {rendering.name}</h1>
          <button onClick={rendering.reload}>Reload</button>
          <button onClick={rendering.close}>Close</button>
        </section>
      );
    case 'error':
      return (
        <section>
          <h1>Profile</h1>
          <p>{rendering.message}</p>
          <button onClick={rendering.retry}>Retry</button>
          <button onClick={rendering.close}>Close</button>
        </section>
      );
  }
}
// README_SNIPPET_END: react
