# Persistence

Use persisted runtimes when you want automatic state saves on every transition.

## Requirements

`version` is required for persisted runtimes.

You must provide both:

- `serialize(state)`
- `deserialize(raw, props)`

## Storage adapters

`@workflow-ts/core` provides:

- `localStorageStorage()`
- `sessionStorageStorage()`
- `memoryStorage()`

You can also pass a custom async storage implementation (`getItem/setItem/removeItem` returning `Promise`s).

When using React persisted hooks, keep storage adapter instances stable (module scope or `useMemo`).
React hooks use lazy/non-blocking rehydrate semantics for async storage.
When using React persisted hooks, keep codec function references (`serialize`, `deserialize`, `migrate`) stable.

## `createPersistedRuntime` (sync return, lazy rehydrate)

Use this when you need synchronous runtime creation. It accepts both sync and async storage.

```ts
import { createPersistedRuntime, localStorageStorage } from '@workflow-ts/core';

const runtime = createPersistedRuntime(workflow, props, {
  storage: localStorageStorage(),
  key: 'profile-v1:u1',
  version: 2,
  rehydrate: 'lazy', // default
  writeDebounceMs: 250,
  serialize: (state) => JSON.stringify(state),
  deserialize: (raw, _props) => JSON.parse(raw),
});
```

Supported rehydrate modes:

- `'none'`: skip loading persisted data.
- `'lazy'` (default): create runtime first, then apply persisted snapshot if found.
  - Sync storage reads happen during creation.
  - Async storage reads resolve later and hydrate non-blockingly.

## Async API (`createPersistedRuntimeAsync`)

Use this when storage may be async.

```ts
import { createPersistedRuntimeAsync } from '@workflow-ts/core';

const runtime = await createPersistedRuntimeAsync(workflow, props, {
  storage: customAsyncStorage,
  key: 'profile-v1:u1',
  version: 2,
  rehydrate: 'blocking', // default
  serialize: (state) => JSON.stringify(state),
  deserialize: (raw, _props) => JSON.parse(raw),
});
```

Supported rehydrate modes:

- `'none'`: skip loading persisted data.
- `'lazy'`: return runtime immediately, hydrate later.
- `'blocking'` (default): wait for storage read, then create runtime from snapshot.

## Versioning and migration

Persisted values are stored in a versioned envelope (`{ v, data }`).

Use `migrate` when stored version differs from config version:

```ts
const runtime = createPersistedRuntime(workflow, props, {
  storage: localStorageStorage(),
  key: `profile:${userId}`,
  version: 3,
  serialize: (state) => JSON.stringify(state),
  deserialize: (raw, _props) => JSON.parse(raw),
  migrate: (raw, fromVersion, toVersion) => {
    if (fromVersion === 2 && toVersion === 3) {
      return migrateV2ToV3(raw);
    }
    throw new Error(`Unsupported migration ${fromVersion} -> ${toVersion}`);
  },
});
```

## Custom serialization

You can override default snapshot handling:

```ts
const runtime = createPersistedRuntime(workflow, props, {
  storage: localStorageStorage(),
  key: `profile:${userId}`,
  version: 1,
  serialize: (state) => compress(JSON.stringify(state)),
  deserialize: (raw, _props) => JSON.parse(decompress(raw)),
});
```

## Error handling and corruption recovery

Persistence failures never stop runtime execution.

- Default behavior logs a one-time warning per operation key with `[workflow-ts/persist]`.
- `onError(error, context)` receives structured error metadata.
- Rehydrate failures (invalid envelope, deserialize error, migrate error) remove stored value and continue from fresh state.

```ts
const runtime = createPersistedRuntime(workflow, props, {
  storage: localStorageStorage(),
  key: 'profile-v1:u1',
  version: 2,
  serialize: (state) => JSON.stringify(state),
  deserialize: (raw, _props) => JSON.parse(raw),
  onError: (error, context) => {
    reportPersistenceError(error, context);
  },
});
```

## Keying guidance

`key` is required and must be explicit.

Recommended pattern:

- Include workflow/domain + version + identity: `profile:v1:${userId}`
- Bump version when snapshot schema changes.
