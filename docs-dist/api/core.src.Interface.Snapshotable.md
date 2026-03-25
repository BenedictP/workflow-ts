[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / Snapshotable

# Interface: Snapshotable

Defined in: [core/src/snapshot.ts:8](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/snapshot.ts#L8)

Interface for types that can be snapshotted.

## Methods

### toSnapshot()

```ts
toSnapshot(): string;
```

Defined in: [core/src/snapshot.ts:12](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/snapshot.ts#L12)

Serialize to a string for persistence.

#### Returns

`string`

***

### fromSnapshot()

```ts
fromSnapshot(snapshot): Snapshotable;
```

Defined in: [core/src/snapshot.ts:17](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/snapshot.ts#L17)

Restore from a snapshot string.

#### Parameters

##### snapshot

`string`

#### Returns

`Snapshotable`
