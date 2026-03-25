[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / WorkflowRuntime

# Class: WorkflowRuntime\<P, S, O, R\>

Defined in: [core/src/runtime.ts:31](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L31)

Runtime for a single workflow.
Manages state, actions, children, and workers.

## Type Parameters

### P

`P`

Props type

### S

`S`

State type

### O

`O`

Output type

### R

`R`

Rendering type

## Constructors

### Constructor

```ts
new WorkflowRuntime<P, S, O, R>(config): WorkflowRuntime<P, S, O, R>;
```

Defined in: [core/src/runtime.ts:43](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L43)

#### Parameters

##### config

[`RuntimeConfig`](core.src.Interface.RuntimeConfig.md)\<`P`, `S`, `O`, `R`\>

#### Returns

`WorkflowRuntime`\<`P`, `S`, `O`, `R`\>

## Methods

### getRendering()

```ts
getRendering(): R;
```

Defined in: [core/src/runtime.ts:51](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L51)

Get the current rendering. Cached between state changes.

#### Returns

`R`

***

### getState()

```ts
getState(): S;
```

Defined in: [core/src/runtime.ts:63](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L63)

Get the current state (for testing/debugging).

#### Returns

`S`

***

### getProps()

```ts
getProps(): P;
```

Defined in: [core/src/runtime.ts:70](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L70)

Get the current props.

#### Returns

`P`

***

### subscribe()

```ts
subscribe(listener): () => void;
```

Defined in: [core/src/runtime.ts:80](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L80)

Subscribe to rendering changes.

#### Parameters

##### listener

(`rendering`) => `void`

Callback when rendering changes

#### Returns

Unsubscribe function

```ts
(): void;
```

##### Returns

`void`

***

### updateProps()

```ts
updateProps(props): void;
```

Defined in: [core/src/runtime.ts:93](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L93)

Update props (triggers re-render).

#### Parameters

##### props

`P`

New props

#### Returns

`void`

***

### send()

```ts
send(action): void;
```

Defined in: [core/src/runtime.ts:105](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L105)

Send an action directly to the runtime.

#### Parameters

##### action

[`Action`](core.src.TypeAlias.Action.md)\<`S`, `O`\>

The action to process

#### Returns

`void`

***

### snapshot()

```ts
snapshot(): string | undefined;
```

Defined in: [core/src/runtime.ts:112](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L112)

Get a snapshot of the current state.

#### Returns

`string` \| `undefined`

***

### dispose()

```ts
dispose(): void;
```

Defined in: [core/src/runtime.ts:122](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L122)

Dispose of this runtime and all children.

#### Returns

`void`

***

### isDisposed()

```ts
isDisposed(): boolean;
```

Defined in: [core/src/runtime.ts:135](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/runtime.ts#L135)

Check if the runtime has been disposed.

#### Returns

`boolean`
