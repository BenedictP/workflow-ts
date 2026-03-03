import type { Action } from './types';

// ============================================================
// DevTools Types
// ============================================================

/**
 * Event types for DevTools
 */
export type DevToolsEventType =
  | 'init'
  | 'action:send'
  | 'action:complete'
  | 'action:error'
  | 'stateChange'
  | 'render'
  | 'render:complete'
  | 'worker:start'
  | 'worker:complete'
  | 'worker:abort'
  | 'output'
  | 'props:update';

/**
 * Base event structure
 */
export interface DevToolsEvent<S = unknown, O = unknown, R = unknown> {
  readonly type: DevToolsEventType;
  readonly timestamp: number;
  readonly state?: S;
  readonly rendering?: R;
  readonly action?: Action<S, O>;
  readonly prevState?: S;
  readonly newState?: S;
  readonly output?: O;
  readonly key?: string;
  readonly workerKey?: string;
  readonly reason?: string;
  readonly error?: Error;
  readonly durationMs?: number;
  readonly props?: unknown;
}

/**
 * DevTools configuration options
 */
export interface DevToolsOptions {
  /** Maximum number of events to store */
  maxEvents?: number;
  /** Enable time travel (stores state history) */
  enableTimeTravel?: boolean;
  /** Enable performance timing */
  enableTiming?: boolean;
  /** Auto-pause on errors */
  autoPause?: boolean;
  /** Latency threshold for warnings (ms) */
  latencyThreshold?: number;
}

/**
 * DevTools state snapshot
 */
export interface DevToolsSnapshot<S> {
  readonly state: S;
  readonly index: number;
  readonly timestamp: number;
}

/**
 * DevTools interface
 */
export interface DevTools<S = unknown, O = unknown, R = unknown> {
  /** Unique identifier */
  readonly id: string;
  /** Whether devtools is enabled */
  isEnabled(): boolean;
  /** Enable/disable devtools */
  setEnabled(enabled: boolean): void;
  /** Subscribe to events */
  subscribe(handler: (event: DevToolsEvent<S, O, R>) => void): () => void;
  /** Get all events */
  getEvents(): DevToolsEvent<S, O, R>[];
  /** Get current state snapshot */
  getState(): { currentState: S; events: DevToolsEvent<S, O, R>[] };
  /** Get state history for time travel */
  getHistory(): DevToolsSnapshot<S>[];
  /** Jump to a specific state in history */
  jumpTo(index: number): DevToolsSnapshot<S> | undefined;
  /** Go back in history */
  undo(): DevToolsSnapshot<S> | undefined;
  /** Go forward in history */
  redo(): DevToolsSnapshot<S> | undefined;
  /** Whether can undo */
  canUndo(): boolean;
  /** Whether can redo */
  canRedo(): boolean;
  /** Export state */
  serialize(): string;
  /** Import state */
  deserialize(data: string): void;
  /** Clear all events */
  clear(): void;
  /** Reset to initial state */
  reset(): void;
  /** Internal: set current state */
  _setCurrentState(state: S): void;
  /** Internal: log event */
  _log(event: Omit<DevToolsEvent<S, O, R>, 'timestamp'>): void;
}

// ============================================================
// Implementation
// ============================================================

let devToolsIdCounter = 0;

/**
 * Create a DevTools instance
 */
export function createDevTools<S = unknown, O = unknown, R = unknown>(
  options: DevToolsOptions = {},
): RuntimeDevTools<S, O, R> {
  const {
    maxEvents = 1000,
    enableTimeTravel = true,
    enableTiming: _enableTiming = true,
    latencyThreshold: _latencyThreshold = 100,
  } = options;

  let enabled = true;
  let currentState: S | undefined;
  const events: DevToolsEvent<S, O, R>[] = [];
  const history: DevToolsSnapshot<S>[] = [];
  let historyIndex = -1;
  const subscribers = new Set<(event: DevToolsEvent<S, O, R>) => void>();

  const id = `devtools-${++devToolsIdCounter}`;

  const _log = (event: Omit<DevToolsEvent<S, O, R>, 'timestamp'>) => {
    if (!enabled) return;

    const fullEvent: DevToolsEvent<S, O, R> = {
      ...event,
      timestamp: Date.now(),
    };

    events.push(fullEvent);

    // Trim events if over limit
    if (events.length > maxEvents) {
      events.shift();
    }

    // Update history for time travel
    if (enableTimeTravel && event.type === 'stateChange' && event.newState !== undefined) {
      // Remove any future states if we're not at the end
      if (historyIndex < history.length - 1) {
        history.splice(historyIndex + 1);
      }

      history.push({
        state: event.newState as S,
        index: history.length,
        timestamp: fullEvent.timestamp,
      });
      historyIndex = history.length - 1;
    }

    // Notify subscribers
    subscribers.forEach((handler) => {
      try {
        handler(fullEvent);
      } catch (e) {
        console.error('DevTools subscriber error:', e);
      }
    });
  };

  return {
    id,

    isEnabled: () => enabled,

    setEnabled: (value: boolean) => {
      enabled = value;
    },

    subscribe: (handler: (event: DevToolsEvent<S, O, R>) => void) => {
      subscribers.add(handler);
      return () => subscribers.delete(handler);
    },

    getEvents: () => [...events],

    getState: () => ({
      currentState: currentState as S,
      events: [...events],
    }),

    getHistory: () => [...history],

    jumpTo: (index: number) => {
      if (!enableTimeTravel || index < 0 || index >= history.length) {
        return undefined;
      }
      historyIndex = index;
      return history[historyIndex];
    },

    undo: () => {
      if (historyIndex > 0) {
        historyIndex--;
        return history[historyIndex];
      }
      return undefined;
    },

    redo: () => {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        return history[historyIndex];
      }
      return undefined;
    },

    canUndo: () => historyIndex > 0,

    canRedo: () => historyIndex < history.length - 1,

    serialize: () => {
      return JSON.stringify({
        events: events,
        history: history,
        historyIndex: historyIndex,
        currentState: currentState,
      });
    },

    deserialize: (data: string) => {
      try {
        const parsed = JSON.parse(data);
        events.length = 0;
        events.push(...parsed.events);
        history.length = 0;
        history.push(...parsed.history);
        historyIndex = parsed.historyIndex;
        currentState = parsed.currentState;
      } catch (e) {
        console.error('Failed to deserialize devtools state:', e);
      }
    },

    clear: () => {
      events.length = 0;
    },

    reset: () => {
      events.length = 0;
      history.length = 0;
      historyIndex = -1;
      currentState = undefined;
    },

    // Internal methods for runtime to use
    _setCurrentState: (state: S) => {
      currentState = state;
    },

    _log,
  };
}

/**
 * Type for internal runtime access
 */
export interface RuntimeDevTools<S, O, R> extends DevTools<S, O, R> {
  _setCurrentState: (state: S) => void;
  _log: (event: Omit<DevToolsEvent<S, O, R>, 'timestamp'>) => void;
}
