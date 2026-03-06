import type { RenderContext, Workflow } from './types';

export interface StatefulWorkflowConfig<P, S, O, R> {
  readonly initialState: (props: P, snapshot?: string) => S;
  readonly render: (props: P, state: S, context: RenderContext<S, O>) => R;
  readonly onPropsChanged?: (oldProps: P, newProps: P, state: S) => S;
  readonly snapshot?: (state: S) => string;
}

/**
 * Ergonomic builder for stateful workflows with full type inference.
 *
 * @example
 * ```typescript
 * const workflow = createStatefulWorkflow({
 *   initialState: () => ({ count: 0 }),
 *   render: (_props, state, ctx) => ({
 *     count: state.count,
 *     increment: () => ctx.actionSink.send((s) => ({ state: { count: s.count + 1 } })),
 *   }),
 * });
 * ```
 */
export function createStatefulWorkflow<P, S, O, R>(
  config: StatefulWorkflowConfig<P, S, O, R>,
): Workflow<P, S, O, R> {
  return {
    initialState: config.initialState,
    render: config.render,
    onPropsChanged: config.onPropsChanged,
    snapshot: config.snapshot,
  };
}
