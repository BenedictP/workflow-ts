[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / RenderContext

# Interface: RenderContext\<S, O\>

Defined in: [core/src/types.ts:74](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L74)

RenderContext: Provides access to runtime services during render.
Used to send actions, render children, and run workers.

## Type Parameters

### S

`S`

State type

### O

`O`

Output type

## Properties

### actionSink

```ts
readonly actionSink: Sink<Action<S, O>>;
```

Defined in: [core/src/types.ts:78](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L78)

Send an action to the runtime.

***

### renderChild()

```ts
readonly renderChild: <CP, CS, CO, CR>(workflow, props, key?, handler?) => CR;
```

Defined in: [core/src/types.ts:89](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L89)

Render a child workflow and get its rendering.

#### Type Parameters

##### CP

`CP`

##### CS

`CS`

##### CO

`CO`

##### CR

`CR`

#### Parameters

##### workflow

[`Workflow`](core.src.Interface.Workflow.md)\<`CP`, `CS`, `CO`, `CR`\>

The child workflow to render

##### props

`CP`

Props to pass to the child

##### key?

`string`

Unique key for this child (used for lifecycle)

##### handler?

(`output`) => [`Action`](core.src.TypeAlias.Action.md)\<`S`, `O`\>

Handler for child outputs

#### Returns

`CR`

The child's rendering

***

### runWorker()

```ts
readonly runWorker: <W>(worker, key, handler) => void;
```

Defined in: [core/src/types.ts:105](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L105)

Run a worker (side effect) and handle its output.
Workers are started when first called with a key, and stopped
when render() doesn't call them anymore.

#### Type Parameters

##### W

`W`

#### Parameters

##### worker

[`Worker`](core.src.Interface.Worker.md)\<`W`\>

The worker to run

##### key

`string`

Unique key for this worker

##### handler

(`output`) => [`Action`](core.src.TypeAlias.Action.md)\<`S`, `O`\>

Handler for worker outputs

#### Returns

`void`
