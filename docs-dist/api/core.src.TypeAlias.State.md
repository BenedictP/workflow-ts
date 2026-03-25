[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / State

# Type Alias: State\<T\>

```ts
type State<T> = T;
```

Defined in: [core/src/types.ts:19](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L19)

State: Internal state of a workflow, managed by the runtime.
Must be immutable - state transitions return new state objects.

## Type Parameters

### T

`T`

The state type
