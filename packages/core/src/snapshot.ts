// ============================================================
// Snapshot utilities for state persistence
// ============================================================

/**
 * Error thrown when a snapshot cannot be parsed.
 * This typically indicates a corrupted or malformed snapshot from external storage.
 */
export class SnapshotParseError extends Error {
  /** The raw snapshot string that failed to parse */
  public readonly rawSnapshot: string;

  constructor(message: string, cause: unknown, rawSnapshot: string) {
    super(message, { cause });
    this.name = 'SnapshotParseError';
    this.rawSnapshot = rawSnapshot;
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SnapshotParseError);
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
