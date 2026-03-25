[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / Action

# Type Alias: Action()\<S, O\>

```ts
type Action<S, O> = (state) => ActionResult<S, O>;
```

Defined in: [core/src/types.ts:43](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L43)

Action: A pure function that transforms state and optionally emits output.
Actions are the only way to change workflow state.

## Type Parameters

### S

`S`

The state type

### O

`O` = `never`

The output type (defaults to never if no output)

## Parameters

### state

`S`

## Returns

[`ActionResult`](core.src.Interface.ActionResult.md)\<`S`, `O`\>
