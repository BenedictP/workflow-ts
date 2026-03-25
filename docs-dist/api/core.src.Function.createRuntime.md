[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / createRuntime

# Function: createRuntime()

```ts
function createRuntime<P, S, O, R>(
   workflow, 
   props, 
onOutput?): WorkflowRuntime<P, S, O, R>;
```

Defined in: [core/src/runtime.ts:301](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L301)

Create a workflow runtime.

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

### props

`P`

### onOutput?

(`output`) => `void`

## Returns

[`WorkflowRuntime`](core.src.Class.WorkflowRuntime.md)\<`P`, `S`, `O`, `R`\>

## Example

```typescript
const runtime = createRuntime(myWorkflow, { initialValue: 0 });
const rendering = runtime.getRendering();

runtime.subscribe((rendering) => {
  console.log('New rendering:', rendering);
});
```
