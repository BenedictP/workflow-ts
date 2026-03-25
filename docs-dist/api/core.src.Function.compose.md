[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / compose

# Function: compose()

```ts
function compose<S, O>(...actions): Action<S, O>;
```

Defined in: [core/src/action.ts:64](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/action.ts#L64)

Compose multiple actions into one.
Actions are applied in order, last output wins.

## Type Parameters

### S

`S`

### O

`O`

## Parameters

### actions

...readonly [`Action`](core.src.TypeAlias.Action.md)\<`S`, `O`\>[]

## Returns

[`Action`](core.src.TypeAlias.Action.md)\<`S`, `O`\>

## Example

```typescript
const resetAndNotify = compose(
  (s) => ({ ...s, value: 0 }),
  (s) => ({ ...s, resetAt: Date.now() })
);
```
