import { createRuntime } from '@workflow-ts/core';
import { describe, expect, it } from 'vitest';

import { counterWorkflow, type Rendering } from '../src/workflow';

describe('Counter Workflow', () => {
  it('starts at zero', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    expect(runtime.getState().count).toBe(0);
    const rendering = runtime.getRendering();
    expect(rendering.type).toBe('atZero');
    expect(rendering.count).toBe(0);
    runtime.dispose();
  });
  
  it('increments up to max', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    
    for (let i = 0; i < 15; i++) {
      const rendering = runtime.getRendering();
      if (rendering.type === 'atZero' || rendering.type === 'counting') {
        rendering.increment();
      }
    }
    
    expect(runtime.getState().count).toBe(10);
    expect(runtime.getRendering().type).toBe('atMax');
    runtime.dispose();
  });
  
  it('emits output at boundaries', () => {
    const outputs: unknown[] = [];
    const runtime = createRuntime(counterWorkflow, undefined, (o) => outputs.push(o));
    
    const rendering1 = runtime.getRendering();
    if (rendering1.type === 'atZero') {
      rendering1.increment();
    }
    expect(outputs).toHaveLength(0);
    
    const rendering2 = runtime.getRendering();
    if (rendering2.type === 'counting') {
      rendering2.decrement();
    }
    expect(outputs).toEqual([{ type: 'reachedZero' }]);
    
    runtime.dispose();
  });
});
