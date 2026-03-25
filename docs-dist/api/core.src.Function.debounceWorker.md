[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / debounceWorker

# Function: debounceWorker()

```ts
function debounceWorker<T>(
   key, 
   worker, 
delayMs): Worker<T>;
```

Defined in: [core/src/worker.ts:237](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/worker.ts#L237)

Create a debounced worker.
Waits for the specified delay before running the inner worker.

## Type Parameters

### T

`T`

## Parameters

### key

`string`

### worker

[`Worker`](core.src.Interface.Worker.md)\<`T`\>

### delayMs

`number`

## Returns

[`Worker`](core.src.Interface.Worker.md)\<`T`\>

## Example

```typescript
const debouncedSearch = debounceWorker(
  'search',
  createWorker('search-inner', async (s) => search(query)),
  300
);
```
