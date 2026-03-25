[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / jsonSnapshot

# Function: jsonSnapshot()

```ts
function jsonSnapshot<S>(): object;
```

Defined in: [core/src/snapshot.ts:32](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/snapshot.ts#L32)

Create a snapshot handler using JSON serialization.

## Type Parameters

### S

`S`

## Returns

`object`

### snapshot()

```ts
snapshot: (state) => string;
```

#### Parameters

##### state

`S`

#### Returns

`string`

### restore()

```ts
restore: (snapshot) => S;
```

#### Parameters

##### snapshot

`string`

#### Returns

`S`

## Example

```typescript
const { snapshot, restore } = jsonSnapshot<MyState>();

const state = { count: 5, name: 'test' };
const str = snapshot(state);
const restored = restore(str);
```
