[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / versionedSnapshot

# Function: versionedSnapshot()

```ts
function versionedSnapshot<S>(currentVersion, migrate): object;
```

Defined in: [core/src/snapshot.ts:61](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/snapshot.ts#L61)

Create a versioned snapshot handler.
Useful for handling migrations when state shape changes.

## Type Parameters

### S

`S` *extends* `object`

## Parameters

### currentVersion

`number`

### migrate

(`snapshot`) => `S`

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
const { snapshot, restore } = versionedSnapshot(
  2,
  (snap) => {
    const data = JSON.parse(snap);
    if (data.version === 1) {
      // Migrate from v1 to v2
      return { ...data, newField: 'default' };
    }
    return data;
  }
);
```
