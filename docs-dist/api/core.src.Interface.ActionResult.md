[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / ActionResult

# Interface: ActionResult\<S, O\>

Defined in: [core/src/types.ts:48](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L48)

Result of an action: new state plus optional output.

## Type Parameters

### S

`S`

### O

`O`

## Properties

### state

```ts
readonly state: S;
```

Defined in: [core/src/types.ts:50](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L50)

The new state after the action is applied

***

### output?

```ts
readonly optional output: O;
```

Defined in: [core/src/types.ts:52](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/types.ts#L52)

Optional output to emit to parent
