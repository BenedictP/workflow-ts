[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [react/src](react.src.md) / useWorkflowWithState

# Function: useWorkflowWithState()

```ts
function useWorkflowWithState<P, S, O, R>(workflow, options): UseWorkflowResult<P, S, R>;
```

Defined in: [react/src/useWorkflow.ts:106](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/react/src/useWorkflow.ts#L106)

Hook that returns both rendering and runtime controls.

## Type Parameters

### P

`P`

### S

`S`

### O

`O`

### R

`R`

## Parameters

### workflow

[`Workflow`](core.src.Interface.Workflow.md)\<`P`, `S`, `O`, `R`\>

The workflow definition

### options

[`UseWorkflowOptions`](react.src.Interface.UseWorkflowOptions.md)\<`P`, `O`\>

Hook options

## Returns

[`UseWorkflowResult`](react.src.Interface.UseWorkflowResult.md)\<`P`, `S`, `R`\>

Rendering and runtime controls

## Example

```tsx
const { rendering, state, updateProps } = useWorkflowWithState(
  searchWorkflow,
  { props: { query: '' } }
);

return (
  <div>
    <input onChange={(e) => updateProps({ query: e.target.value })} />
    <ul>{rendering.results.map(r => <li key={r.id}>{r.name}</li>)}</ul>
  </div>
);
```
