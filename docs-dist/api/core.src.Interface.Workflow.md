[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / Workflow

# Interface: Workflow\<P, S, O, R\>

Defined in: [core/src/types.ts:120](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L120)

Workflow: The main interface for defining a workflow.

## Type Parameters

### P

`P`

Props type (input from parent)

### S

`S`

State type (internal state)

### O

`O`

Output type (events to parent)

### R

`R`

Rendering type (external representation)

## Properties

### initialState()

```ts
readonly initialState: (props, snapshot?) => S;
```

Defined in: [core/src/types.ts:129](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L129)

Create the initial state for this workflow.
Called once when the workflow is first started.

#### Parameters

##### props

`P`

The initial props

##### snapshot?

`string`

Optional snapshot to restore from

#### Returns

`S`

The initial state

***

### render()

```ts
readonly render: (props, state, context) => R;
```

Defined in: [core/src/types.ts:140](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L140)

Render the current state into a rendering.
Called after every state change.

#### Parameters

##### props

`P`

Current props

##### state

`S`

Current state

##### context

[`RenderContext`](core.src.Interface.RenderContext.md)\<`S`, `O`\>

Render context for side effects

#### Returns

`R`

The rendering

***

### snapshot()?

```ts
readonly optional snapshot: (state) => string;
```

Defined in: [core/src/types.ts:148](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L148)

Optional: Serialize state to a string for persistence.

#### Parameters

##### state

`S`

The state to snapshot

#### Returns

`string`

Serialized state string

***

### restore()?

```ts
readonly optional restore: (snapshot) => S;
```

Defined in: [core/src/types.ts:156](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L156)

Optional: Restore state from a snapshot.

#### Parameters

##### snapshot

`string`

The snapshot string

#### Returns

`S`

Restored state
