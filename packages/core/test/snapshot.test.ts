import { describe, it, expect } from 'vitest';

import { jsonSnapshot, SnapshotParseError } from '../src';

// ============================================================
// SnapshotParseError Tests
// ============================================================

describe('SnapshotParseError', () => {
  it('should be an instance of Error', () => {
    const error = new SnapshotParseError('test message', new Error('cause'), 'raw');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SnapshotParseError);
  });

  it('should have correct name property', () => {
    const error = new SnapshotParseError('test message', new Error('cause'), 'raw');
    expect(error.name).toBe('SnapshotParseError');
  });

  it('should preserve the error message', () => {
    const error = new SnapshotParseError('custom error message', new Error('cause'), 'raw');
    expect(error.message).toBe('custom error message');
  });

  it('should preserve the cause', () => {
    const cause = new SyntaxError('Unexpected token');
    const error = new SnapshotParseError('test', cause, 'raw');
    expect(error.cause).toBe(cause);
  });

  it('should preserve the rawSnapshot', () => {
    const rawSnapshot = '{broken json';
    const error = new SnapshotParseError('test', new Error('cause'), rawSnapshot);
    expect(error.rawSnapshot).toBe(rawSnapshot);
  });

  it('should have a stack trace', () => {
    const error = new SnapshotParseError('test', new Error('cause'), 'raw');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('SnapshotParseError');
  });
});

// ============================================================
// jsonSnapshot Error Handling Tests
// ============================================================

describe('jsonSnapshot', () => {
  describe('restore with invalid JSON', () => {
    it('should throw SnapshotParseError for malformed JSON', () => {
      const { restore } = jsonSnapshot<{ count: number }>();
      expect(() => restore('invalid json')).toThrow(SnapshotParseError);
    });

    it('should throw SnapshotParseError for incomplete JSON object', () => {
      const { restore } = jsonSnapshot<{ count: number }>();
      expect(() => restore('{broken')).toThrow(SnapshotParseError);
    });

    it('should throw SnapshotParseError for empty string', () => {
      const { restore } = jsonSnapshot<{ count: number }>();
      expect(() => restore('')).toThrow(SnapshotParseError);
    });

    it('should throw SnapshotParseError for undefined-like string', () => {
      const { restore } = jsonSnapshot<{ count: number }>();
      expect(() => restore('undefined')).toThrow(SnapshotParseError);
    });

    it('should include raw snapshot in error', () => {
      const { restore } = jsonSnapshot<{ count: number }>();
      const malformed = '{broken';
      try {
        restore(malformed);
        expect.fail('Should have thrown SnapshotParseError');
      } catch (e) {
        expect(e).toBeInstanceOf(SnapshotParseError);
        expect((e as SnapshotParseError).rawSnapshot).toBe(malformed);
      }
    });

    it('should include original error as cause', () => {
      const { restore } = jsonSnapshot<{ count: number }>();
      try {
        restore('not valid json');
        expect.fail('Should have thrown SnapshotParseError');
      } catch (e) {
        expect(e).toBeInstanceOf(SnapshotParseError);
        expect((e as SnapshotParseError).cause).toBeInstanceOf(SyntaxError);
      }
    });

    it('should include descriptive error message', () => {
      const { restore } = jsonSnapshot<{ count: number }>();
      try {
        restore('not valid json');
        expect.fail('Should have thrown SnapshotParseError');
      } catch (e) {
        expect(e).toBeInstanceOf(SnapshotParseError);
        expect((e as SnapshotParseError).message).toContain('Failed to parse snapshot');
      }
    });
  });

  describe('restore with valid JSON (regression tests)', () => {
    it('should parse valid JSON correctly', () => {
      const { restore } = jsonSnapshot<{ count: number }>();
      const result = restore('{"count": 42}');
      expect(result).toEqual({ count: 42 });
    });

    it('should parse complex nested objects', () => {
      interface ComplexState {
        readonly count: number;
        readonly nested: {
          readonly value: string;
          readonly items: readonly number[];
        };
      }
      const { restore } = jsonSnapshot<ComplexState>();
      const result = restore('{"count": 1, "nested": {"value": "test", "items": [1, 2, 3]}}');
      expect(result).toEqual({
        count: 1,
        nested: {
          value: 'test',
          items: [1, 2, 3],
        },
      });
    });

    it('should parse arrays', () => {
      const { restore } = jsonSnapshot<number[]>();
      const result = restore('[1, 2, 3]');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should parse null', () => {
      const { restore } = jsonSnapshot<null>();
      const result = restore('null');
      expect(result).toBeNull();
    });

    it('should parse primitive values', () => {
      const { restore: restoreNumber } = jsonSnapshot<number>();
      expect(restoreNumber('42')).toBe(42);

      const { restore: restoreString } = jsonSnapshot<string>();
      expect(restoreString('"hello"')).toBe('hello');

      const { restore: restoreBool } = jsonSnapshot<boolean>();
      expect(restoreBool('true')).toBe(true);
    });
  });

  describe('snapshot (serialization)', () => {
    it('should serialize objects to JSON', () => {
      const { snapshot } = jsonSnapshot<{ count: number }>();
      const result = snapshot({ count: 42 });
      expect(result).toBe('{"count":42}');
    });

    it('should serialize arrays to JSON', () => {
      const { snapshot } = jsonSnapshot<number[]>();
      const result = snapshot([1, 2, 3]);
      expect(result).toBe('[1,2,3]');
    });
  });

  describe('round-trip', () => {
    it('should round-trip objects correctly', () => {
      const { snapshot, restore } = jsonSnapshot<{ count: number; name: string }>();
      const original = { count: 42, name: 'test' };
      const serialized = snapshot(original);
      const restored = restore(serialized);
      expect(restored).toEqual(original);
    });

    it('should round-trip complex nested structures', () => {
      interface ComplexState {
        readonly id: number;
        readonly data: {
          readonly items: readonly { readonly name: string; readonly value: number }[];
        };
      }
      const { snapshot, restore } = jsonSnapshot<ComplexState>();
      const original: ComplexState = {
        id: 1,
        data: {
          items: [
            { name: 'a', value: 1 },
            { name: 'b', value: 2 },
          ],
        },
      };
      const serialized = snapshot(original);
      const restored = restore(serialized);
      expect(restored).toEqual(original);
    });
  });
});
