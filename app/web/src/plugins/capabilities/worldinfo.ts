import type { KeyValueStorage } from './storage';
import type { EventBus } from '../../core/events/EventBus';
import type { TokensCapability } from './tokens';
import type { ConnectionsCapability } from './connections';
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
  buildLoreText: (opts: { selectedBookIds: string[]; messages: string[]; globalScanData?: Record<string, unknown>; maxContextTokens?: number }) => Promise<string>;
  explainLastBuild: () => {
    selectedBooks: string[];
    matchedEntryIds: string[];
    budgetUsedTokens: number;
    budgetCapTokens: number;
    overflowed: boolean;
    entriesBySource: Record<string, number>;
    matchedEntries: Array<{
      id: string;
      source: string;
      bookId: string;
      bookName: string;
      tokens: number;
      ignoreBudget: boolean;
      useProbability: boolean;
      probability: number | null;
      group: string;
      groupOverride: boolean;
      groupWeight: number;
    }>;
    logs: Record<string, string[]>;
  };
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

export function createPersistedWorldInfo(
  storage: KeyValueStorage,
  events?: EventBus,
  tokens?: TokensCapability,
  connections?: ConnectionsCapability,
  key = 'worldinfo.v1',
): WorldInfoCapability {
  let state: WorldInfoState = defaultWorldInfoState();
  let lastExplain = {
    selectedBooks: [] as string[],
    matchedEntryIds: [] as string[],
    budgetUsedTokens: 0,
    budgetCapTokens: 0,
    overflowed: false,
    entriesBySource: {} as Record<string, number>,
    matchedEntries: [] as Array<{
      id: string;
      source: string;
      bookId: string;
      bookName: string;
      tokens: number;
      ignoreBudget: boolean;
      useProbability: boolean;
      probability: number | null;
      group: string;
      groupOverride: boolean;
      groupWeight: number;
    }>,
    logs: {} as Record<string, string[]>,
  };
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

  async function buildLoreText(opts: { selectedBookIds: string[]; messages: string[]; globalScanData?: Record<string, unknown>; maxContextTokens?: number }) {
    const selected = new Set(opts.selectedBookIds);
    const globalSelected = new Set(state.globalSelectedBookIds ?? []);

    const globalEntries = [] as ReturnType<typeof normalizeEntry>[];
    const characterEntries = [] as ReturnType<typeof normalizeEntry>[];
    for (const b of state.books) {
      if (!selected.has(b.id)) continue;
      const bucket = globalSelected.has(b.id) ? globalEntries : characterEntries;
      for (const e of b.entries) {
        bucket.push(
          normalizeEntry({
            ...e,
            source: e.source ?? (globalSelected.has(b.id) ? 'global' : 'character'),
            // keep book name for debugging/explain
            meta: { ...(e as any).meta, bookId: b.id, bookName: b.name },
          } as any),
        );
      }
    }

    let entries: ReturnType<typeof normalizeEntry>[] = [];
    const sortFn = (a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0);
    switch (Number((state.settings as any).characterStrategy ?? 1)) {
      case 0: // evenly
        entries = [...globalEntries, ...characterEntries].sort(sortFn);
        break;
      case 2: // global_first
        entries = [...globalEntries.sort(sortFn), ...characterEntries.sort(sortFn)];
        break;
      case 1: // character_first
      default:
        entries = [...characterEntries.sort(sortFn), ...globalEntries.sort(sortFn)];
        break;
    }

    const maxContextTokens = Number(opts.maxContextTokens ?? connections?.getActive?.()?.maxContextTokens ?? 8192);
    const countTokens =
      tokens?.countText ??
      (async (t: string) => {
        const s = String(t ?? '');
        if (!s.trim()) return 0;
        return Math.ceil(s.length / 3.35);
      });

    const activated = await checkWorldInfo({
      entries,
      settings: state.settings as any,
      messages: opts.messages,
      globalScanData: (opts.globalScanData ?? {}) as any,
      maxContextTokens,
      countTokens,
    });

    const matchedEntries = [] as (typeof lastExplain)['matchedEntries'];
    for (const e of activated.activated) {
      const bookId = String((e as any)?.meta?.bookId ?? '');
      const bookName = String((e as any)?.meta?.bookName ?? '');
      const source = String((e as any)?.source ?? 'unknown');
      matchedEntries.push({
        id: e.id,
        source,
        bookId,
        bookName,
        tokens: await countTokens(String(e.content ?? '')),
        ignoreBudget: Boolean((e as any).ignoreBudget ?? false),
        useProbability: Boolean((e as any).useProbability ?? false),
        probability: typeof (e as any).probability === 'number' ? Number((e as any).probability) : null,
        group: String((e as any).group ?? ''),
        groupOverride: Boolean((e as any).groupOverride ?? false),
        groupWeight: typeof (e as any).groupWeight === 'number' ? Number((e as any).groupWeight) : 100,
      });
    }

    lastExplain = {
      selectedBooks: opts.selectedBookIds.slice(),
      matchedEntryIds: activated.matchedEntryIds,
      budgetUsedTokens: activated.explain.budgetUsedTokens,
      budgetCapTokens: activated.explain.budgetCapTokens,
      overflowed: activated.explain.overflowed,
      entriesBySource: activated.explain.entriesBySource,
      matchedEntries,
      logs: activated.explain.logs,
    };

    const lines: string[] = [];
    if (activated.activated.length) {
      // Group by bookName if includeNames is enabled; otherwise concatenate in activation order.
      if (state.settings.includeNames) {
        const byBook = new Map<string, string[]>();
        for (const e of activated.activated) {
          const bookName = String((e as any)?.meta?.bookName ?? 'WorldInfo');
          const arr = byBook.get(bookName) ?? [];
          arr.push(String(e.content ?? ''));
          byBook.set(bookName, arr);
        }
        for (const [bookName, texts] of byBook.entries()) {
          lines.push(`[WorldInfo:${bookName}]`);
          for (const t of texts) lines.push(t);
          lines.push('');
        }
      } else {
        for (const e of activated.activated) lines.push(String(e.content ?? ''));
      }
    }

    const out = lines.join('\n').trim();
    if (activated.explain.overflowed && state.settings.overflowAlert) {
      console.warn(`[WorldInfo] token budget reached (${activated.explain.budgetUsedTokens}/${activated.explain.budgetCapTokens})`);
    }
    return out;
  }

  load();
  function explainLastBuild() {
    return lastExplain;
  }

  return { getState, setSettings, createBook, renameBook, removeBook, setGlobalSelected, upsertEntry, removeEntry, buildLoreText, explainLastBuild };
}

