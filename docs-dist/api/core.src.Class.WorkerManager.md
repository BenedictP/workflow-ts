[**workflow-ts-monorepo**](README.md)

***

[workflow-ts-monorepo](README.md) / [core/src](core.src.md) / WorkerManager

# Class: WorkerManager

Defined in: [core/src/worker.ts:24](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/worker.ts#L24)

Manages worker lifecycle (start/stop based on render calls).
Workers are started when called in render() and stopped when
they're no longer called in subsequent renders.

## Constructors

### Constructor

```ts
new WorkerManager(): WorkerManager;
```

#### Returns

`WorkerManager`

## Accessors

### activeWorkerCount

#### Get Signature

```ts
get activeWorkerCount(): number;
```

Defined in: [core/src/worker.ts:158](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/worker.ts#L158)

Get the count of active workers (for testing).

##### Returns

`number`

## Methods

### beginRenderCycle()

```ts
beginRenderCycle(): void;
```

Defined in: [core/src/worker.ts:36](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/worker.ts#L36)

Begin a new render cycle.
This resets the touched set to track which workers are used.
Must be paired with endRenderCycle().

#### Returns

`void`

***

### endRenderCycle()

```ts
endRenderCycle(): void;
```

Defined in: [core/src/worker.ts:45](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/worker.ts#L45)

End the current render cycle.
Stops any workers that were not touched during the render.

#### Returns

`void`

***

### startWorker()

```ts
startWorker<T>(
   worker, 
   key, 
   onOutput, 
   onComplete): void;
```

Defined in: [core/src/worker.ts:67](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/worker.ts#L67)

Start a worker if not already running.
During a render cycle, marks the worker as touched.

#### Type Parameters

##### T

`T`

#### Parameters

##### worker

[`Worker`](core.src.Interface.Worker.md)\<`T`\>

The worker to start

##### key

`string`

Unique key for this worker

##### onOutput

(`output`) => `void`

Callback when worker produces output

##### onComplete

() => `void`

Callback when worker completes

#### Returns

`void`

***

### stopWorker()

```ts
stopWorker(key): void;
```

Defined in: [core/src/worker.ts:120](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/worker.ts#L120)

Stop a specific worker.

#### Parameters

##### key

`string`

The key of the worker to stop

#### Returns

`void`

***

### stopAll()

```ts
stopAll(): void;
```

Defined in: [core/src/worker.ts:132](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/worker.ts#L132)

Stop all workers.

#### Returns

`void`

***

### getActiveWorkerKeys()

```ts
getActiveWorkerKeys(): readonly string[];
```

Defined in: [core/src/worker.ts:144](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/worker.ts#L144)

Get keys of all active workers.

#### Returns

readonly `string`[]

***

### isRunning()

```ts
isRunning(key): boolean;
```

Defined in: [core/src/worker.ts:151](https://github.com/AICodeHelper/workflow-ts/blob/bf89f7de9099bb01e071c2b4d0c7614592347c29/packages/core/src/worker.ts#L151)

Check if a worker with the given key is running.

#### Parameters

##### key

`string`

#### Returns

`boolean`
