[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / Worker

# Interface: Worker\<T\>

Defined in: [core/src/types.ts:165](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L165)

Worker: A side effect that produces output but no rendering.
Workers are managed by the runtime and have automatic lifecycle.

## Type Parameters

### T

`T`

The output type

## Properties

### key

```ts
readonly key: string;
```

Defined in: [core/src/types.ts:170](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L170)

Unique key for this worker instance.
Used to track worker lifecycle.

***

### run()

```ts
readonly run: (signal) => Promise<T>;
```

Defined in: [core/src/types.ts:178](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L178)

Run the worker and produce output.

#### Parameters

##### signal

`AbortSignal`

AbortSignal for cancellation

#### Returns

`Promise`\<`T`\>

Promise resolving to output
