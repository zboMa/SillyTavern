export type StorageScope = 'local' | 'session';

export type KeyValueStorage = {
  getString: (key: string) => string | null;
  setString: (key: string, value: string) => void;
  remove: (key: string) => void;
};

function pickStorage(scope: StorageScope): Storage {
  return scope === 'session' ? window.sessionStorage : window.localStorage;
}

export class BrowserStorage implements KeyValueStorage {
  constructor(private scope: StorageScope = 'local', private prefix = 'st:web:') {}

  getString(key: string): string | null {
    return pickStorage(this.scope).getItem(this.prefix + key);
  }

  setString(key: string, value: string): void {
    pickStorage(this.scope).setItem(this.prefix + key, value);
  }

  remove(key: string): void {
    pickStorage(this.scope).removeItem(this.prefix + key);
  }
}

