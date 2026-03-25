[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [react/src](react.src.md) / UseWorkflowResult

# Interface: UseWorkflowResult\<P, S, R\>

Defined in: [react/src/useWorkflow.ts:71](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/react/src/useWorkflow.ts#L71)

Hook result that includes both rendering and runtime controls

## Type Parameters

### P

`P`

### S

`S`

### R

`R`

## Properties

### rendering

```ts
rendering: R;
```

Defined in: [react/src/useWorkflow.ts:73](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/react/src/useWorkflow.ts#L73)

Current rendering

***

### state

```ts
state: S;
```

Defined in: [react/src/useWorkflow.ts:75](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/react/src/useWorkflow.ts#L75)

Current state (for debugging)

***

### props

```ts
props: P;
```

Defined in: [react/src/useWorkflow.ts:77](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/react/src/useWorkflow.ts#L77)

Current props

***

### updateProps()

```ts
updateProps: (props) => void;
```

Defined in: [react/src/useWorkflow.ts:79](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/react/src/useWorkflow.ts#L79)

Update props

#### Parameters

##### props

`P`

#### Returns

`void`

***

### snapshot()

```ts
snapshot: () => string | undefined;
```

Defined in: [react/src/useWorkflow.ts:81](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/react/src/useWorkflow.ts#L81)

Snapshot current state

#### Returns

`string` \| `undefined`
