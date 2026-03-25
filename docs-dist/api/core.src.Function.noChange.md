[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / noChange

# Function: noChange()

```ts
function noChange<S>(): Action<S>;
```

Defined in: [core/src/action.ts:48](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/action.ts#L48)

Create an action that doesn't change state or emit output.

## Type Parameters

### S

`S`

## Returns

[`Action`](core.src.TypeAlias.Action.md)\<`S`\>

## Example

```typescript
// Useful as a no-op handler
ctx.actionSink.send(noChange());
```
