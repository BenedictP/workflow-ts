import { useWorkflow } from '@workflow-ts/react';

import { counterWorkflow, type Output, type Rendering } from './workflow';

function CounterRenderer({ rendering }: { rendering: Rendering }): JSX.Element {
  switch (rendering.type) {
    case 'atZero':
      return (
        <div className="counter">
          <h2>Count: {rendering.count}</h2>
          <div className="buttons">
            <button disabled>−</button>
            <button onClick={rendering.increment}>+</button>
            <button disabled>Reset</button>
          </div>
        </div>
      );
    case 'counting':
      return (
        <div className="counter">
          <h2>Count: {rendering.count}</h2>
          <div className="buttons">
            <button onClick={rendering.decrement}>−</button>
            <button onClick={rendering.increment}>+</button>
            <button onClick={rendering.reset}>Reset</button>
          </div>
        </div>
      );
    case 'atMax':
      return (
        <div className="counter">
          <h2>Count: {rendering.count}</h2>
          <div className="buttons">
            <button onClick={rendering.decrement}>−</button>
            <button disabled>+</button>
            <button onClick={rendering.reset}>Reset</button>
          </div>
          <p className="warning">Maximum reached!</p>
        </div>
      );
  }
}

export function Counter(): JSX.Element {
  const rendering = useWorkflow(
    counterWorkflow,
    undefined,
    (output: Output) => {
      if (output.type === 'reachedZero') {
        // Counter reset to zero - could emit event here
      } else {
        // Reached maximum - could emit event here
      }
    }
  );

  return <CounterRenderer rendering={rendering} />;
}
