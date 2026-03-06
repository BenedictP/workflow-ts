import type { Action, ActionResult } from './types';

// ============================================================
// Interceptor Types
// ============================================================

/**
 * Context provided to interceptors
 */
export interface InterceptorContext<S> {
  /** Current state before action is processed */
  state: S;
  /** Current props */
  props: unknown;
  /** Workflow identifier */
  workflowKey: string;
}

/**
 * Why a state change happened.
 */
export type InterceptorStateChangeReason = 'action' | 'propsChanged';

/**
 * State change details emitted from action processing.
 */
export interface ActionStateChange<S, O> {
  readonly reason: 'action';
  readonly prevState: S;
  readonly nextState: S;
  readonly action: Action<S, O>;
  readonly actionName?: string;
}

/**
 * State change details emitted from onPropsChanged processing.
 */
export interface PropsChangedStateChange<S> {
  readonly reason: 'propsChanged';
  readonly prevState: S;
  readonly nextState: S;
}

/**
 * State change details provided to interceptors.
 */
export type InterceptorStateChange<S, O> = ActionStateChange<S, O> | PropsChangedStateChange<S>;

/**
 * Configuration for an interceptor
 */
export interface InterceptorConfig<S, O> {
  /** Unique name for debugging */
  name: string;

  /** Called before action is processed */
  onSend?: (action: Action<S, O>, context: InterceptorContext<S>) => void;

  /**
   * Called after action is processed.
   * Intended for side effects only.
   */
  onResult?: (
    action: Action<S, O>,
    result: ActionResult<S, O>,
    context: InterceptorContext<S>,
  ) => void;

  /** Called if action throws */
  onError?: (action: Action<S, O>, error: Error, context: InterceptorContext<S>) => void;

  /** Called after state changes (from actions or onPropsChanged). */
  onStateChange?: (change: InterceptorStateChange<S, O>, context: InterceptorContext<S>) => void;

  /** Filter which actions this interceptor applies to */
  filter?: (action: Action<S, O>) => boolean;
}

/**
 * An interceptor that can be composed
 */
export interface Interceptor<S, O> {
  readonly name: string;
  readonly config: InterceptorConfig<S, O>;
}

// ============================================================
// Interceptor Factory
// ============================================================

/**
 * Create an interceptor with the given configuration
 */
export function createInterceptor<S, O>(
  name: string,
  config: {
    onSend?: (action: Action<S, O>, context: InterceptorContext<S>) => void;
    onResult?: (
      action: Action<S, O>,
      result: ActionResult<S, O>,
      context: InterceptorContext<S>,
    ) => void;
    onError?: (action: Action<S, O>, error: Error, context: InterceptorContext<S>) => void;
    onStateChange?: (change: InterceptorStateChange<S, O>, context: InterceptorContext<S>) => void;
    filter?: (action: Action<S, O>) => boolean;
  },
): Interceptor<S, O> {
  const fullConfig: InterceptorConfig<S, O> = {
    name,
    onSend: config.onSend,
    onResult: config.onResult,
    onError: config.onError,
    onStateChange: config.onStateChange,
    filter: config.filter,
  };
  return {
    name,
    config: fullConfig,
  };
}

// ============================================================
// Built-in Interceptors
// ============================================================

/**
 * Logger interface for logging interceptors
 */
export interface InterceptorLogger {
  log(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Options for the logging interceptor
 */
export interface LoggingInterceptorOptions {
  /** Custom logger */
  logger?: InterceptorLogger;
  /** Whether to log action results */
  logResults?: boolean;
  /** Whether to log state changes */
  logState?: boolean;
  /** Custom prefix for log messages */
  prefix?: string;
}

/**
 * Create a logging interceptor
 */
export function loggingInterceptor<S, O>(
  options: LoggingInterceptorOptions = {},
): Interceptor<S, O> {
  const { logger = console, logResults = true, logState = false, prefix = '[workflow]' } = options;

  const config: InterceptorConfig<S, O> = {
    name: 'logging',
    onSend: (action, _ctx) => {
      logger.log(`${prefix} Action:`, String(action));
      if (logState) {
        logger.log(`${prefix} State:`, _ctx.state);
      }
    },
  };

  if (logResults) {
    config.onResult = (action, result) => {
      logger.log(`${prefix} Action completed:`, String(action));
      if (logState) {
        logger.log(`${prefix} New State:`, result.state);
      }
    };
    config.onError = (action, error) => {
      logger.error(`${prefix} Action error:`, String(action), error);
    };
  }

  return { name: 'logging', config };
}

/**
 * Options for the debug interceptor
 */
export interface DebugInterceptorOptions {
  /** Enable logging */
  enabled?: boolean;
  /** Custom logger */
  logger?: InterceptorLogger;
  /** Log action sends */
  logSend?: boolean;
  /** Log results */
  logResults?: boolean;
}

/**
 * Create a debug interceptor that can be toggled
 */
export function debugInterceptor<S, O>(options: DebugInterceptorOptions = {}): Interceptor<S, O> {
  const { enabled = true, logger = console, logSend = true, logResults = true } = options;

  const config: InterceptorConfig<S, O> = {
    name: 'debug',
    filter: () => enabled,
  };

  if (logSend) {
    config.onSend = (action) => {
      logger.log(`[workflow] Debug: Action send`, {
        action: String(action),
      });
    };
  }

  if (logResults) {
    config.onResult = (action) => {
      logger.log(`[workflow] Debug: Action result`, {
        action: String(action),
      });
    };
  }

  return { name: 'debug', config };
}

// ============================================================
// Interceptor Composition
// ============================================================

/**
 * Compose multiple interceptors into a single interceptor chain
 */
export function composeInterceptors<S, O>(...interceptors: Interceptor<S, O>[]): Interceptor<S, O> {
  const name = interceptors.map((i) => i.name).join(' → ');

  const config: InterceptorConfig<S, O> = {
    name,
    onSend: (action, ctx) => {
      for (const interceptor of interceptors) {
        if (interceptor.config.filter?.(action) === false) continue;
        interceptor.config.onSend?.(action, ctx);
      }
    },
    onResult: (action, result, ctx) => {
      for (const interceptor of interceptors) {
        if (interceptor.config.filter?.(action) === false) continue;
        interceptor.config.onResult?.(action, result, ctx);
      }
    },
    onError: (action, error, _ctx) => {
      for (const interceptor of interceptors) {
        if (interceptor.config.filter?.(action) === false) continue;
        interceptor.config.onError?.(action, error, _ctx);
      }
    },
    onStateChange: (change, ctx) => {
      for (const interceptor of interceptors) {
        interceptor.config.onStateChange?.(change, ctx);
      }
    },
  };

  return { name, config };
}
