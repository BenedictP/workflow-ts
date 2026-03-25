[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [react/src](react.src.md) / useWorkflow

# Function: useWorkflow()

```ts
function useWorkflow<P, S, O, R>(
   workflow, 
   props, 
   onOutput?): R;
```

Defined in: [react/src/useWorkflow.ts:25](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/react/src/useWorkflow.ts#L25)

Hook to use a workflow in a React component.

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

### props

`P`

Props to pass to the workflow

### onOutput?

(`output`) => `void`

Optional callback for workflow outputs

## Returns

`R`

The current rendering

## Example

```tsx
const counter = useWorkflow(counterWorkflow, undefined);
return (
  <div>
    <span>{counter.count}</span>
    <button onClick={counter.onIncrement}>+</button>
    <button onClick={counter.onDecrement}>-</button>
  </div>
);
```
