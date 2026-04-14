export interface SyncStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AsyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type PersistStorage = SyncStorage | AsyncStorage;

const createUnavailableStorage = (): Storage => {
  const unavailable = (): never => {
    throw new Error('Storage is not available in this environment');
  };

  return {
    get length(): number {
      return 0;
    },
    clear: unavailable,
    getItem: unavailable,
    key: unavailable,
    removeItem: unavailable,
    setItem: unavailable,
  };
};

const getStorage = (kind: 'localStorage' | 'sessionStorage'): Storage => {
  const host = globalThis as {
    readonly localStorage?: Storage;
    readonly sessionStorage?: Storage;
  };

  try {
    const storage = host[kind];
    if (storage === undefined) {
      return createUnavailableStorage();
    }
    return storage;
  } catch {
    return createUnavailableStorage();
  }
};

const createWebStorageAdapter = (kind: 'localStorage' | 'sessionStorage'): SyncStorage => {
  return {
    getItem: (key: string): string | null => {
      try {
        return getStorage(kind).getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key: string, value: string): void => {
      try {
        getStorage(kind).setItem(key, value);
      } catch {
        // Persistence should degrade gracefully when storage is unavailable.
      }
    },
    removeItem: (key: string): void => {
      try {
        getStorage(kind).removeItem(key);
      } catch {
        // Persistence should degrade gracefully when storage is unavailable.
      }
    },
  };
};

export function localStorageStorage(): SyncStorage {
  return createWebStorageAdapter('localStorage');
}

export function sessionStorageStorage(): SyncStorage {
  return createWebStorageAdapter('sessionStorage');
}

export function memoryStorage(): SyncStorage {
  const store = new Map<string, string>();

  return {
    getItem: (key: string): string | null => {
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string): void => {
      store.set(key, value);
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
  };
}
