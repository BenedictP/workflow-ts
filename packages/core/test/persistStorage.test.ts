import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  localStorageStorage,
  memoryStorage,
  sessionStorageStorage,
  type SyncStorage,
} from '../src/persistStorage';

const mockStorage = (): Storage => {
  const store = new Map<string, string>();

  return {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    key(index: number): string | null {
      const keys = [...store.keys()];
      return keys[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
  };
};

const restoreStorage = (
  kind: 'localStorage' | 'sessionStorage',
  descriptor?: PropertyDescriptor,
): void => {
  if (descriptor === undefined) {
    delete (globalThis as Record<string, unknown>)[kind];
    return;
  }
  Object.defineProperty(globalThis, kind, descriptor);
};

describe('persistStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('memoryStorage should store, read, and remove values', () => {
    const storage = memoryStorage();

    expect(storage.getItem('k')).toBeNull();

    storage.setItem('k', 'v1');
    expect(storage.getItem('k')).toBe('v1');

    storage.removeItem('k');
    expect(storage.getItem('k')).toBeNull();
  });

  it('localStorageStorage should delegate to localStorage when available', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const storageMock = mockStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => storageMock,
    });

    const storage = localStorageStorage();
    storage.setItem('a', '1');

    expect(storage.getItem('a')).toBe('1');
    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();

    restoreStorage('localStorage', original);
  });

  it('sessionStorageStorage should delegate to sessionStorage when available', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    const storageMock = mockStorage();
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get: () => storageMock,
    });

    const storage = sessionStorageStorage();
    storage.setItem('a', '1');

    expect(storage.getItem('a')).toBe('1');
    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();

    restoreStorage('sessionStorage', original);
  });

  it('localStorageStorage should degrade gracefully when storage accessor throws', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });

    const storage: SyncStorage = localStorageStorage();

    expect(storage.getItem('a')).toBeNull();
    expect(() => storage.setItem('a', '1')).not.toThrow();
    expect(() => storage.removeItem('a')).not.toThrow();

    restoreStorage('localStorage', original);
  });

  it('sessionStorageStorage should degrade gracefully when storage is missing', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    delete (globalThis as Record<string, unknown>).sessionStorage;

    const storage = sessionStorageStorage();

    expect(storage.getItem('a')).toBeNull();
    expect(() => storage.setItem('a', '1')).not.toThrow();
    expect(() => storage.removeItem('a')).not.toThrow();

    restoreStorage('sessionStorage', original);
  });
});
