[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / Observable

# Interface: Observable\<T\>

Defined in: [core/src/types.ts:186](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L186)

Observable: Minimal observable interface for reactive workers.

## Type Parameters

### T

`T`

The value type

## Methods

### subscribe()

```ts
subscribe(observer): Subscription;
```

Defined in: [core/src/types.ts:193](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L193)

Subscribe to the observable.

#### Parameters

##### observer

The observer object

###### next

(`value`) => `void`

###### error?

(`error`) => `void`

###### complete?

() => `void`

#### Returns

[`Subscription`](core.src.Interface.Subscription.md)

A subscription that can be unsubscribed
