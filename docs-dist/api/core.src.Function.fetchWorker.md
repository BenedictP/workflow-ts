[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / fetchWorker

# Function: fetchWorker()

```ts
function fetchWorker<T>(
   key, 
   url, 
options?): Worker<T>;
```

Defined in: [core/src/worker.ts:214](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/worker.ts#L214)

Create a worker that fetches JSON data.

## Type Parameters

### T

`T`

## Parameters

### key

`string`

### url

`string`

### options?

`RequestInit`

## Returns

[`Worker`](core.src.Interface.Worker.md)\<`T`\>

## Example

```typescript
const fetchTodos = fetchWorker<Todo[]>('fetch-todos', '/api/todos');
```
