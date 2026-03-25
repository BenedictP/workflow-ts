[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / RuntimeConfig

# Interface: RuntimeConfig\<P, S, O, R\>

Defined in: [core/src/runtime.ts:11](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L11)

Configuration for creating a workflow runtime.

## Type Parameters

### P

`P`

### S

`S`

### O

`O`

### R

`R`

## Properties

### workflow

```ts
readonly workflow: Workflow<P, S, O, R>;
```

Defined in: [core/src/runtime.ts:13](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L13)

The workflow to run

***

### props

```ts
readonly props: P;
```

Defined in: [core/src/runtime.ts:15](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L15)

Initial props for the workflow

***

### onOutput()?

```ts
readonly optional onOutput: (output) => void;
```

Defined in: [core/src/runtime.ts:17](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L17)

Optional callback for workflow outputs

#### Parameters

##### output

`O`

#### Returns

`void`

***

### initialState?

```ts
readonly optional initialState: S;
```

Defined in: [core/src/runtime.ts:19](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L19)

Optional initial state (for testing)
