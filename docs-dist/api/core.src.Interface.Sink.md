[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / Sink

# Interface: Sink\<A\>

Defined in: [core/src/types.ts:58](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L58)

Sink: Interface for sending actions to the runtime.

## Type Parameters

### A

`A`

## Properties

### send()

```ts
readonly send: (action) => void;
```

Defined in: [core/src/types.ts:64](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L64)

Send an action to be processed by the runtime.

#### Parameters

##### action

`A`

The action to send

#### Returns

`void`
