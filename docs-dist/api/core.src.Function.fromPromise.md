[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / fromPromise

# Function: fromPromise()

```ts
function fromPromise<T>(key, factory): Worker<T>;
```

Defined in: [core/src/worker.ts:196](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/worker.ts#L196)

Create a worker from a promise factory.

## Type Parameters

### T

`T`

## Parameters

### key

`string`

### factory

() => `Promise`\<`T`\>

## Returns

[`Worker`](core.src.Interface.Worker.md)\<`T`\>

## Example

```typescript
const loadData = fromPromise('load-data', () => api.getData());
```
