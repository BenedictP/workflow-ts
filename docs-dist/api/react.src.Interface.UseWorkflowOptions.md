[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [react/src](react.src.md) / UseWorkflowOptions

# Interface: UseWorkflowOptions\<P, O\>

Defined in: [react/src/useWorkflow.ts:61](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/react/src/useWorkflow.ts#L61)

Hook options for useWorkflowWithState

## Type Parameters

### P

`P`

### O

`O`

## Properties

### props

```ts
props: P;
```

Defined in: [react/src/useWorkflow.ts:63](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/react/src/useWorkflow.ts#L63)

Initial props for the workflow

***

### onOutput()?

```ts
optional onOutput: (output) => void;
```

Defined in: [react/src/useWorkflow.ts:65](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/react/src/useWorkflow.ts#L65)

Callback for workflow outputs

#### Parameters

##### output

`O`

#### Returns

`void`
