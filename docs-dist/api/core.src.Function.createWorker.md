[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / createWorker

# Function: createWorker()

```ts
function createWorker<T>(key, run): Worker<T>;
```

Defined in: [core/src/worker.ts:178](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/worker.ts#L178)

Create a worker from an async function.

## Type Parameters

### T

`T`

## Parameters

### key

`string`

### run

(`signal`) => `Promise`\<`T`\>

## Returns

[`Worker`](core.src.Interface.Worker.md)\<`T`\>

## Example

```typescript
const fetchUser = createWorker('fetch-user', async (signal) => {
  const response = await fetch('/api/user', { signal });
  return response.json();
});
```
