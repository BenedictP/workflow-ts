import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createDevTools,
  type DevToolsEvent,
} from '../src/devtools';
import {
  createRuntime,
  action,
  named,
  type Workflow,
  type Action,
} from '../src/index';

describe('DevTools', () => {
  describe('createDevTools', () => {
    it('should create devtools instance', () => {
      const devTools = createDevTools();

      expect(devTools.id).toBeDefined();
      expect(devTools.isEnabled()).toBe(true);
    });

    it('should respect maxEvents option', () => {
      const devTools = createDevTools({ maxEvents: 3 });

      // Log more events than maxEvents
      devTools._log({ type: 'init', state: {} });
      devTools._log({ type: 'action:send', state: {} });
      devTools._log({ type: 'action:complete', state: {} });
      devTools._log({ type: 'stateChange', state: {} });
      devTools._log({ type: 'output', state: {} });

      expect(devTools.getEvents()).toHaveLength(3);
    });

    it('should enable/disable devtools', () => {
      const devTools = createDevTools();

      devTools.setEnabled(false);
      expect(devTools.isEnabled()).toBe(false);

      devTools._log({ type: 'init', state: {} });
      expect(devTools.getEvents()).toHaveLength(0);

      devTools.setEnabled(true);
      devTools._log({ type: 'init', state: {} });
      expect(devTools.getEvents()).toHaveLength(1);
    });

    it('should subscribe to events', () => {
      const devTools = createDevTools();
      const handler = vi.fn();

      const unsubscribe = devTools.subscribe(handler);

      devTools._log({ type: 'init', state: { count: 1 } });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'init', state: { count: 1 } })
      );

      unsubscribe();
      devTools._log({ type: 'action:send', state: {} });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should track state history for time travel', () => {
      const devTools = createDevTools({ enableTimeTravel: true });

      devTools._setCurrentState({ count: 0 });
      devTools._log({ type: 'stateChange', newState: { count: 1 } });
      devTools._log({ type: 'stateChange', newState: { count: 2 } });
      devTools._log({ type: 'stateChange', newState: { count: 3 } });

      const history = devTools.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0].state).toEqual({ count: 1 });
      expect(history[1].state).toEqual({ count: 2 });
      expect(history[2].state).toEqual({ count: 3 });
    });

    it('should support undo/redo', () => {
      const devTools = createDevTools({ enableTimeTravel: true });

      devTools._setCurrentState({ count: 0 });
      devTools._log({ type: 'stateChange', newState: { count: 1 } });
      devTools._log({ type: 'stateChange', newState: { count: 2 } });
      devTools._log({ type: 'stateChange', newState: { count: 3 } });

      expect(devTools.canUndo()).toBe(true);
      expect(devTools.canRedo()).toBe(false);

      const snapshot1 = devTools.undo();
      expect(snapshot1?.state).toEqual({ count: 2 });
      expect(devTools.canRedo()).toBe(true);

      const snapshot2 = devTools.redo();
      expect(snapshot2?.state).toEqual({ count: 3 });
    });

    it('should serialize/deserialize', () => {
      const devTools = createDevTools();

      devTools._log({ type: 'init', state: { count: 1 } });
      devTools._log({ type: 'action:send', state: { count: 2 } });

      const serialized = devTools.serialize();
      expect(serialized).toContain('"events"');

      const devTools2 = createDevTools();
      devTools2.deserialize(serialized);

      expect(devTools2.getEvents()).toHaveLength(2);
    });

    it('should clear events', () => {
      const devTools = createDevTools();

      devTools._log({ type: 'init', state: {} });
      devTools._log({ type: 'action:send', state: {} });

      expect(devTools.getEvents()).toHaveLength(2);

      devTools.clear();
      expect(devTools.getEvents()).toHaveLength(0);
    });

    it('should reset state', () => {
      const devTools = createDevTools({ enableTimeTravel: true });

      devTools._log({ type: 'init', state: {} });
      devTools._log({ type: 'stateChange', newState: { count: 1 } });

      devTools.reset();

      expect(devTools.getEvents()).toHaveLength(0);
      expect(devTools.getHistory()).toHaveLength(0);
    });
  });

  describe('Runtime with DevTools', () => {
    interface CounterState {
      count: number;
    }

    const counterWorkflow: Workflow<
      void,
      CounterState,
      void,
      { count: number }
    > = {
      initialState: () => ({ count: 0 }),
      render: (_props, state) => ({ count: state.count }),
    };

    it('should log init event', () => {
       
      const devTools = createDevTools<CounterState, void, { count: number }>();
      const runtime = createRuntime(counterWorkflow, undefined, { devTools });

      const events = devTools.getEvents();
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'init' })
      );

      runtime.dispose();
    });

    it('should log action events', () => {
       
      const devTools = createDevTools<CounterState, void, { count: number }>();
      const runtime = createRuntime(counterWorkflow, undefined, { devTools });

      runtime.send((state) => ({ state: { count: state.count + 5 } }));

      const events = devTools.getEvents();
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'action:send' })
      );
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'action:complete' })
      );
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'stateChange' })
      );

      runtime.dispose();
    });

    it('should include actionName for named actions in devtools events', () => {
       
      const devTools = createDevTools<CounterState, void, { count: number }>();
      const runtime = createRuntime(counterWorkflow, undefined, { devTools });

      runtime.send(named('bumpCount', (state) => ({ state: { count: state.count + 1 } })));

      const sendEvent = devTools.getEvents().find((event) => event.type === 'action:send');
      const completeEvent = devTools.getEvents().find((event) => event.type === 'action:complete');

      expect(sendEvent?.actionName).toBe('bumpCount');
      expect(completeEvent?.actionName).toBe('bumpCount');

      runtime.dispose();
    });

    it('should log render events', () => {
       
      const devTools = createDevTools<CounterState, void, { count: number }>();
      const runtime = createRuntime(counterWorkflow, undefined, { devTools });

      runtime.getRendering();

      const events = devTools.getEvents();
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'render' })
      );
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'render:complete' })
      );

      runtime.dispose();
    });

    it('should track state history', () => {
       
      const devTools = createDevTools<CounterState, void, { count: number }>({
        enableTimeTravel: true,
      });
      const runtime = createRuntime(counterWorkflow, undefined, { devTools });

      runtime.send((state) => ({ state: { count: state.count + 1 } }));
      runtime.send((state) => ({ state: { count: state.count + 1 } }));
      runtime.send((state) => ({ state: { count: state.count + 1 } }));

      const history = devTools.getHistory();
      expect(history).toHaveLength(3);
      expect(history[2].state.count).toBe(3);

      runtime.dispose();
    });

    it('should log props update', () => {
      interface Props {
        value: number;
      }
      interface State {
        value: number;
      }
      const workflow: Workflow<Props, State, void, { value: number }> = {
        initialState: () => ({ value: 0 }),
        render: (props, state) => ({ value: props.value }),
      };

       
      const devTools = createDevTools<State, void, { value: number }>();
      const runtime = createRuntime(workflow, { value: 1 }, { devTools });

      runtime.updateProps({ value: 2 });

      const events = devTools.getEvents();
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'props:update' })
      );

      runtime.dispose();
    });

    it('should work without devTools', () => {
      const runtime = createRuntime(counterWorkflow, undefined);

      runtime.send((state) => ({ state: { count: state.count + 1 } }));

      expect(runtime.getState()).toEqual({ count: 1 });

      runtime.dispose();
    });
  });
});
