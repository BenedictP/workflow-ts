[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / named

# Function: named()

```ts
function named<S, O>(name, act): Action<S, O> & object;
```

Defined in: [core/src/action.ts:93](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/action.ts#L93)

Create an action with a name (for debugging).

## Type Parameters

### S

`S`

### O

`O`

## Parameters

### name

`string`

### act

[`Action`](core.src.TypeAlias.Action.md)\<`S`, `O`\>

## Returns

[`Action`](core.src.TypeAlias.Action.md)\<`S`, `O`\> & `object`

## Example

```typescript
const increment = named('increment', (s) => ({ count: s.count + 1 }));
console.log(increment.name); // 'increment'
```
