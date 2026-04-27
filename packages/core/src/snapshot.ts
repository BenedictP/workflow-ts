// ============================================================
// Snapshot utilities for state persistence
// ============================================================

/**
 * Error thrown when a snapshot cannot be parsed.
 * This typically indicates a corrupted or malformed snapshot from external storage.
 */
const RAW_SNAPSHOT_MAX_LENGTH = 200;

export class SnapshotParseError extends Error {
  /** The raw snapshot string that failed to parse, truncated to 200 characters */
  public readonly rawSnapshot: string;

  constructor(message: string, cause: unknown, rawSnapshot: string) {
    super(message, { cause });
    this.name = 'SnapshotParseError';
    this.rawSnapshot =
      rawSnapshot.length > RAW_SNAPSHOT_MAX_LENGTH
        ? `${rawSnapshot.slice(0, RAW_SNAPSHOT_MAX_LENGTH)}…`
        : rawSnapshot;
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    const errorConstructor = Error as typeof Error & {
      captureStackTrace?: (
        target: object,
        // Error.captureStackTrace accepts any constructor function to trim from.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructorOpt?: abstract new (...args: any[]) => unknown,
      ) => void;
    };
    if (typeof errorConstructor.captureStackTrace === 'function') {
      errorConstructor.captureStackTrace(this, SnapshotParseError);
    }
  }
}

/**
 * Interface for types that can be snapshotted.
 */
export interface Snapshotable {
  /**
   * Serialize to a string for persistence.
   */
  toSnapshot(): string;

  /**
   * Restore from a snapshot string.
   */
  fromSnapshot(snapshot: string): Snapshotable;
}

/**
 * Create a snapshot handler using JSON serialization.
 *
 * @example
 * ```typescript
 * const { snapshot, restore } = jsonSnapshot<MyState>();
 *
 * const state = { count: 5, name: 'test' };
 * const str = snapshot(state);
 * const restored = restore(str);
 * ```
 */
export function jsonSnapshot<S>(): {
  snapshot: (state: S) => string;
  restore: (snapshot: string) => S;
} {
  return {
    snapshot: (state: S): string => JSON.stringify(state),
    restore: (snapshot: string): S => {
      try {
        return JSON.parse(snapshot) as S;
      } catch (error) {
        const message =
          error instanceof Error
            ? `Failed to parse snapshot: ${error.message}`
            : 'Failed to parse snapshot: Unknown error';
        throw new SnapshotParseError(message, error, snapshot);
      }
    },
  };
}

/**
 * Create a versioned snapshot handler.
 * Useful for handling migrations when state shape changes.
 *
 * @example
 * ```typescript
 * const { snapshot, restore } = versionedSnapshot(
 *   2,
 *   (snap) => {
 *     const data = JSON.parse(snap);
 *     if (data.version === 1) {
 *       // Migrate from v1 to v2
 *       return { ...data, newField: 'default' };
 *     }
 *     return data;
 *   }
 * );
 * ```
 */
export function versionedSnapshot<S extends { readonly version: number }>(
  currentVersion: number,
  migrate: (snapshot: string) => S,
): {
  snapshot: (state: S) => string;
  restore: (snapshot: string) => S;
} {
  return {
    snapshot: (state: S): string => {
      return JSON.stringify({ ...state, version: currentVersion });
    },
    restore: (snapshot: string): S => {
      return migrate(snapshot);
    },
  };
}
