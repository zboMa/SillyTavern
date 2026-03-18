import type { KeyValueStorage } from './storage';
import type { EventBus } from '../../core/events/EventBus';
import type { WorldInfoBook, WorldInfoEntry, WorldInfoState, WorldInfoSettings } from '../../features/worldinfo/model';
import { defaultWorldInfoState } from '../../features/worldinfo/model';
import { checkWorldInfo, normalizeEntry } from '../../core/worldinfo/engine';

export type WorldInfoCapability = {
  getState: () => WorldInfoState;
  setSettings: (settings: WorldInfoSettings) => void;
  createBook: (name: string) => WorldInfoBook;
  renameBook: (id: string, name: string) => void;
  removeBook: (id: string) => void;
  setGlobalSelected: (bookIds: string[]) => void;
  upsertEntry: (bookId: string, entry: WorldInfoEntry) => void;
  removeEntry: (bookId: string, entryId: string) => void;
  buildLoreText: (opts: { selectedBookIds: string[]; messages: string[]; globalScanData?: Record<string, unknown> }) => string;
  explainLastBuild: () => { selectedBooks: string[]; matchedEntryIds: string[]; budgetUsedChars: number; logs: Record<string, string[]> };
};

type PersistedWorldInfoV1 = {
  version: 1;
  state: WorldInfoState;
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function createPersistedWorldInfo(storage: KeyValueStorage, events?: EventBus, key = 'worldinfo.v1'): WorldInfoCapability {
  let state: WorldInfoState = defaultWorldInfoState();
  let lastExplain = { selectedBooks: [] as string[], matchedEntryIds: [] as string[], budgetUsedChars: 0, logs: {} as Record<string, string[]> };
  const emit = () => events?.emit('worldinfo.changed', {});

  function save() {
    const payload: PersistedWorldInfoV1 = { version: 1, state };
    storage.setString(key, JSON.stringify(payload));
    emit();
  }

  function load() {
    const persisted = safeParse<PersistedWorldInfoV1>(storage.getString(key));
    if (persisted?.version === 1 && persisted.state) {
      state = { ...defaultWorldInfoState(), ...persisted.state };
    }
    if (!state.books.length) {
      const now = Date.now();
      state.books = [
        {
          id: crypto.randomUUID(),
          name: 'Example Lorebook',
          entries: [
            { id: crypto.randomUUID(), keys: 'example', content: 'This is an example World Info entry.', enabled: true, priority: 0 },
          ],
          createdAt: now,
          updatedAt: now,
        },
      ];
      state.globalSelectedBookIds = [state.books[0].id];
      save();
    }
  }

  function getState() {
    return state;
  }

  function setSettings(settings: WorldInfoSettings) {
    state = { ...state, settings: { ...settings } };
    save();
  }

  function createBook(name: string) {
    const now = Date.now();
    const book: WorldInfoBook = { id: crypto.randomUUID(), name, entries: [], createdAt: now, updatedAt: now };
    state = { ...state, books: [book, ...state.books] };
    save();
    return book;
  }

  function renameBook(id: string, name: string) {
    const now = Date.now();
    state = {
      ...state,
      books: state.books.map((b) => (b.id === id ? { ...b, name, updatedAt: now } : b)),
    };
    save();
  }

  function removeBook(id: string) {
    state = { ...state, books: state.books.filter((b) => b.id !== id), globalSelectedBookIds: state.globalSelectedBookIds.filter((x) => x !== id) };
    save();
  }

  function setGlobalSelected(bookIds: string[]) {
    state = { ...state, globalSelectedBookIds: bookIds.slice() };
    save();
  }

  function upsertEntry(bookId: string, entry: WorldInfoEntry) {
    const now = Date.now();
    state = {
      ...state,
      books: state.books.map((b) => {
        if (b.id !== bookId) return b;
        const idx = b.entries.findIndex((e) => e.id === entry.id);
        const entries = idx >= 0 ? b.entries.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...b.entries];
        return { ...b, entries, updatedAt: now };
      }),
    };
    save();
  }

  function removeEntry(bookId: string, entryId: string) {
    const now = Date.now();
    state = {
      ...state,
      books: state.books.map((b) => (b.id === bookId ? { ...b, entries: b.entries.filter((e) => e.id !== entryId), updatedAt: now } : b)),
    };
    save();
  }

  function buildLoreText(opts: { selectedBookIds: string[]; messages: string[]; globalScanData?: Record<string, unknown> }) {
    const selected = new Set(opts.selectedBookIds);
    const lines: string[] = [];
    for (const b of state.books) {
      if (!selected.has(b.id)) continue;
      const entries = b.entries.map(normalizeEntry);
      const activated = checkWorldInfo({
        entries,
        settings: state.settings as any,
        messages: opts.messages,
        globalScanData: (opts.globalScanData ?? {}) as any,
      });

      lastExplain = {
        selectedBooks: opts.selectedBookIds.slice(),
        matchedEntryIds: activated.matchedEntryIds,
        budgetUsedChars: activated.explain.budgetUsedChars,
        logs: activated.explain.logs,
      };

      if (!activated.activated.length) continue;
      if (state.settings.includeNames) lines.push(`[WorldInfo:${b.name}]`);
      for (const e of activated.activated.slice().sort((a, b2) => (b2.priority ?? 0) - (a.priority ?? 0))) {
        lines.push(e.content);
      }
      lines.push('');
    }
    let out = lines.join('\n').trim();
    if (state.settings.budgetCap && state.settings.budgetCap > 0 && out.length > state.settings.budgetCap) {
      out = out.slice(0, state.settings.budgetCap);
    }
    lastExplain = { ...lastExplain, budgetUsedChars: out.length };
    return out;
  }

  load();
  function explainLastBuild() {
    return lastExplain;
  }

  return { getState, setSettings, createBook, renameBook, removeBook, setGlobalSelected, upsertEntry, removeEntry, buildLoreText, explainLastBuild };
}

