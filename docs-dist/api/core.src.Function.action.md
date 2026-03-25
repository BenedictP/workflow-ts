[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / action

# Function: action()

## Call Signature

```ts
function action<S>(update): Action<S>;
```

Defined in: [core/src/action.ts:15](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/action.ts#L15)

Create an action that updates state.

### Type Parameters

#### S

`S`

### Parameters

#### update

(`state`) => `S`

### Returns

[`Action`](core.src.TypeAlias.Action.md)\<`S`\>

### Example

```typescript
const increment = action((state) => ({ count: state.count + 1 }));
```

## Call Signature

```ts
function action<S, O>(update, output): Action<S, O>;
```

Defined in: [core/src/action.ts:16](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/action.ts#L16)

Create an action that updates state.

### Type Parameters

#### S

`S`

#### O

`O`

### Parameters

#### update

(`state`) => `S`

#### output

`O`

### Returns

[`Action`](core.src.TypeAlias.Action.md)\<`S`, `O`\>

### Example

```typescript
const increment = action((state) => ({ count: state.count + 1 }));
```
