# @workflow-ts/react

React hooks for workflow-ts.

## Installation

```bash
pnpm add @workflow-ts/react @workflow-ts/core
```

## Hooks

### `useWorkflow(workflow, props, onOutput?, options?)`

Subscribe to a workflow's rendering. Re-renders component when workflow state changes.

```tsx
import { useWorkflow } from '@workflow-ts/react';
import { type Workflow } from '@workflow-ts/core';

const counterWorkflow: Workflow<void, State, never, Rendering> = {
  // ... workflow definition
};

function Counter() {
  const { count, onIncrement, onDecrement } = useWorkflow(
    counterWorkflow,
    undefined  // props
  );
  
  return (
    <div>
      <span>{count}</span>
      <button onClick={onIncrement}>+</button>
      <button onClick={onDecrement}>-</button>
    </div>
  );
}
```

**Parameters:**
- `workflow` - The workflow definition
- `props` - Props to pass to the workflow
- `onOutput?` - Optional callback for workflow outputs
- `options?` - Optional hook options

**Options:**
- `resetOnWorkflowChange?: boolean` - Recreate runtime when workflow identity changes (opt-in). Defaults to `false`. To hard-reset in React, consider using a component `key`.

**Returns:** The current rendering (type `R` from workflow)

### `useWorkflowWithState(workflow, options)`

Like `useWorkflow`, but also exposes runtime controls.

```tsx
import { useWorkflowWithState } from '@workflow-ts/react';

function SearchComponent() {
  const { rendering, state, updateProps, snapshot } = useWorkflowWithState(
    searchWorkflow,
    {
      props: { query: '' },
      onOutput: (output) => console.log('Output:', output),
    }
  );
  
  return (
    <div>
      <input
        value={state.query}
        onChange={(e) => updateProps({ query: e.target.value })}
      />
      <ul>
        {rendering.results.map(r => <li key={r.id}>{r.name}</li>)}
      </ul>
    </div>
  );
}
```

**Options:**
- `props: P` - Initial props
- `onOutput?: (output: O) => void` - Output callback
- `resetOnWorkflowChange?: boolean` - Recreate runtime when workflow identity changes (opt-in). Defaults to `false`.

**Returns:**
- `rendering: R` - Current rendering
- `state: S` - Current state (for debugging)
- `props: P` - Current props
- `updateProps: (props: P) => void` - Update props
- `snapshot: () => string | undefined` - Get state snapshot

## Example: Async Data Fetching

```tsx
import { useWorkflow } from '@workflow-ts/react';
import { type Workflow, createWorker } from '@workflow-ts/core';

type State =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; users: User[] }
  | { type: 'error'; message: string };

interface Rendering {
  isLoading: boolean;
  users: User[];
  error: string | null;
  load: () => void;
}

const loadUsersWorker = createWorker('load-users', async (signal) => {
  const res = await fetch('/api/users', { signal });
  return res.json();
});

const usersWorkflow: Workflow<void, State, never, Rendering> = {
  initialState: () => ({ type: 'idle' }),
  
  render: (_props, state, ctx) => {
    if (state.type === 'loading') {
      ctx.runWorker(loadUsersWorker, 'load', (users) => () => ({
        state: { type: 'success', users },
      }));
    }
    
    return {
      isLoading: state.type === 'loading',
      users: state.type === 'success' ? state.users : [],
      error: state.type === 'error' ? state.message : null,
      load: () => ctx.actionSink.send(() => ({ state: { type: 'loading' } })),
    };
  },
};

function UserList() {
  const { isLoading, users, error, load } = useWorkflow(usersWorkflow, undefined);
  
  useEffect(() => {
    load();
  }, []);
  
  if (isLoading) return <Spinner />;
  if (error) return <Error message={error} />;
  
  return (
    <ul>
      {users.map(user => <li key={user.id}>{user.name}</li>)}
    </ul>
  );
}
```

## Example: Props-Driven Workflow

```tsx
import { useWorkflow } from '@workflow-ts/react';

// Workflow that derives state from props
const searchWorkflow: Workflow<{ query: string }, State, never, Rendering> = {
  initialState: (props) => ({ query: props.query, results: [] }),
  
  render: (props, state, ctx) => {
    // Update state when props change
    if (props.query !== state.query) {
      ctx.actionSink.send((s) => ({ state: { ...s, query: props.query } }));
    }
    
    return {
      query: state.query,
      results: state.results,
    };
  },
};

function Search() {
  const [input, setInput] = useState('');
  const { results } = useWorkflow(searchWorkflow, { query: input });
  
  return (
    <div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <ul>
        {results.map(r => <li key={r.id}>{r.name}</li>)}
      </ul>
    </div>
  );
}
```

## Testing Components

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { useWorkflow } from '@workflow-ts/react';

test('counter increments', () => {
  render(<Counter />);
  
  expect(screen.getByText('0')).toBeInTheDocument();
  
  fireEvent.click(screen.getByText('+'));
  
  expect(screen.getByText('1')).toBeInTheDocument();
});
```

## TypeScript Tips

### Extract Types

```typescript
// Define types separately for reuse
interface CounterState {
  count: number;
}

interface CounterRendering {
  count: number;
  onIncrement: () => void;
  onDecrement: () => void;
}

type CounterOutput = { type: 'reachedZero' } | { type: 'reachedTen' };

const counterWorkflow: Workflow<void, CounterState, CounterOutput, CounterRendering> = {
  // ...
};

// Use in component
function Counter() {
  const rendering: CounterRendering = useWorkflow(counterWorkflow, undefined);
  // ...
}
```

### Generic Components

```tsx
interface WorkflowProps<P, R> {
  workflow: Workflow<P, any, any, R>;
  props: P;
}

function WorkflowComponent<P, R>({ workflow, props }: WorkflowProps<P, R>) {
  const rendering = useWorkflow(workflow, props);
  // ...
}
```

## License

MIT
