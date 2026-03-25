[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / emit

# Function: emit()

```ts
function emit<O>(output): Action<unknown, O>;
```

Defined in: [core/src/action.ts:32](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/action.ts#L32)

Create an action that only emits output without changing state.

## Type Parameters

### O

`O`

## Parameters

### output

`O`

## Returns

[`Action`](core.src.TypeAlias.Action.md)\<`unknown`, `O`\>

## Example

```typescript
const emitResult = emit({ type: 'completed', score: 100 });
```
