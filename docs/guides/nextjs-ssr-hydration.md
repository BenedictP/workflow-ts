# Next.js SSR and hydration

Use this guide when integrating `@workflow-ts/react` into a Next.js app that uses server rendering.

## Why this matters

Next.js renders on the server and then hydrates on the client. The first client render must match the server HTML. If they differ, React reports hydration errors and can attach handlers incorrectly.

## What workflow-ts already provides

- `useWorkflow` creates a runtime per hook instance, not as a module-global singleton.
- React integration uses `useSyncExternalStore`, which is designed for consistent external store snapshots across render environments.

These properties help, but hydration safety still depends on how your workflow is written.

## Required rules for SSR-safe workflows

1. Use `useWorkflow` and `useWorkflowWithState` only in Client Components (`'use client'`).
2. Keep initial workflow output deterministic for the same props on server and client.
3. Do not branch render output on browser-only checks (for example `typeof window !== 'undefined'`) in the first render path.
4. Do not use non-deterministic values (`Date.now()`, `Math.random()`) in `initialState` or first render output.
5. Do not store mutable workflow runtime state in module globals.

## App Router pattern (recommended)

Fetch and normalize data in a Server Component, then pass deterministic props to a Client Component that uses the workflow.

```tsx
// app/profile/[id]/page.tsx (Server Component)
import { ProfileScreenClient } from './ProfileScreenClient';

export default async function Page({ params }: { params: { id: string } }) {
  const initial = await fetchProfile(params.id);
  return <ProfileScreenClient userId={params.id} initialName={initial.name} />;
}
```

```tsx
// app/profile/[id]/ProfileScreenClient.tsx (Client Component)
'use client';

import { useWorkflow } from '@workflow-ts/react';
import { profileWorkflow } from '@/workflows/profileWorkflow';

export function ProfileScreenClient(props: { userId: string; initialName: string }) {
  const rendering = useWorkflow(profileWorkflow, props);
  return <ProfileRenderer rendering={rendering} />;
}
```

## Pages Router pattern

The same constraints apply in Pages Router:

- compute deterministic initial props in `getServerSideProps` / `getStaticProps`
- keep workflow hook usage in client-rendered React components
- avoid first-render divergence between server and client

## Workers and SSR caveat

`workflow-ts` workers are started from `render` via `ctx.runWorker(...)`. Runtime behavior is environment-aware: workers run in browser-like/React Native/test runtimes, and are blocked in server-like non-test runtimes.

Practical implications:

- SSR is safer by default because workers do not start on the server path.
- Hydration still depends on your initial render being deterministic.

Recommendations:

1. Gate worker start conditions so first SSR render stays deterministic and side-effect free unless explicitly intended.
2. Prefer passing server-fetched data as initial workflow props/state inputs instead of starting fetch workers in the initial SSR render.
3. Initialize workflow state from server data so hydration does not bounce from `loading` back to `loading`.
4. Run refresh workers only after hydration (user intent, retry, refresh action, or explicit stale-data policy).
5. If a flow is fully client-driven, place it behind a client-only boundary.

## Hydration mismatch checklist

If you see hydration warnings:

1. Confirm server and first client render receive the same workflow props.
2. Check `initialState` and first render logic for time/random/window usage.
3. Check conditional JSX branches that differ by environment.
4. Verify worker-driven transitions are not changing state before hydration completes.

## Do and do not

| Do | Do not |
| --- | --- |
| Keep initial render deterministic from props | Use random/time-dependent values in first render |
| Use Client Components for workflow hooks | Call workflow hooks from Server Components |
| Feed server-fetched data as deterministic props | Start first-render fetch workers by default on SSR paths |
| Treat hydration warnings as correctness bugs | Ignore hydration warnings as harmless |

## Related guides

- [React integration](./react.md)
- [Snapshots](./snapshots.md)
- [Workers](./workers.md)
