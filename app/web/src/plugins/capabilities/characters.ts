import type { CharacterCard, CharacterId } from '../../core/characters/model';
import type { KeyValueStorage } from './storage';

export type CharactersCapability = {
  list: () => CharacterCard[];
  getActive: () => CharacterCard | null;
  setActive: (id: CharacterId) => void;
  getById: (id: CharacterId) => CharacterCard | null;
  upsert: (card: CharacterCard) => void;
  create: (partial?: Partial<CharacterCard>) => CharacterCard;
  duplicate: (id: CharacterId) => CharacterCard | null;
  remove: (id: CharacterId) => void;
  exportJson: () => object;
  importJson: (data: unknown) => void;
};

type PersistedCharactersV1 = {
  version: 1;
  activeId: CharacterId | null;
  cards: CharacterCard[];
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function createInMemoryCharacters(): CharactersCapability {
  const cards: CharacterCard[] = [];
  let activeId: CharacterId | null = null;
  const now = () => Date.now();
  const uuid = () => crypto.randomUUID();

  function create(partial: Partial<CharacterCard> = {}): CharacterCard {
    const t = now();
    const card: CharacterCard = {
      id: uuid(),
      name: partial.name ?? 'New Character',
      description: partial.description ?? '',
      personality: partial.personality ?? '',
      scenario: partial.scenario ?? '',
      firstMessage: partial.firstMessage ?? '',
      exampleMessages: partial.exampleMessages ?? '',
      creatorNotes: partial.creatorNotes ?? '',
      systemPrompt: partial.systemPrompt ?? '',
      favorite: partial.favorite ?? false,
      tags: partial.tags ?? [],
      worldInfoId: partial.worldInfoId ?? null,
      activeChatSessionId: partial.activeChatSessionId ?? null,
      avatarUrl: partial.avatarUrl ?? null,
      createdAt: t,
      updatedAt: t,
    };
    cards.unshift(card);
    activeId = card.id;
    return card;
  }

  function list() {
    return cards
      .slice()
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
  }

  function getById(id: CharacterId) {
    return cards.find((c) => c.id === id) ?? null;
  }

  function getActive() {
    return activeId ? getById(activeId) : null;
  }

  function setActive(id: CharacterId) {
    if (getById(id)) activeId = id;
  }

  function upsert(card: CharacterCard) {
    const idx = cards.findIndex((c) => c.id === card.id);
    const t = now();
    const next: CharacterCard = { ...card, updatedAt: t };
    if (idx >= 0) {
      cards[idx] = next;
    } else {
      cards.unshift(next);
    }
    activeId = next.id;
  }

  function remove(id: CharacterId) {
    const idx = cards.findIndex((c) => c.id === id);
    if (idx >= 0) cards.splice(idx, 1);
    if (activeId === id) activeId = cards[0]?.id ?? null;
  }

  function duplicate(id: CharacterId) {
    const src = getById(id);
    if (!src) return null;
    const copy = create({
      ...src,
      name: `${src.name} (copy)`,
    });
    return copy;
  }

  function exportJson(): PersistedCharactersV1 {
    return {
      version: 1,
      activeId,
      cards: cards.slice(),
    };
  }

  function importJson(data: unknown) {
    const d = data as Partial<PersistedCharactersV1>;
    if (!d || d.version !== 1 || !Array.isArray(d.cards)) {
      throw new Error('Invalid characters export format');
    }
    cards.splice(0, cards.length, ...d.cards);
    activeId = typeof d.activeId === 'string' || d.activeId === null ? (d.activeId as CharacterId | null) : null;
    if (activeId && !cards.some((c) => c.id === activeId)) {
      activeId = cards[0]?.id ?? null;
    }
  }

  // seed
  create({
    name: 'Example Character',
    description: 'Seeded character for the rewritten frontend.',
    firstMessage: 'Hello. This is a Vue3 rewrite scaffold.',
    favorite: true,
  });

  return { list, getActive, setActive, getById, upsert, create, duplicate, remove, exportJson, importJson };
}

export function createPersistedCharacters(storage: KeyValueStorage, key = 'characters.v1'): CharactersCapability {
  const base = createInMemoryCharacters();

  const persisted = safeParse<PersistedCharactersV1>(storage.getString(key));
  if (persisted?.version === 1) {
    try {
      base.importJson(persisted);
    } catch {
      // ignore bad data
    }
  }

  const save = () => {
    storage.setString(key, JSON.stringify(base.exportJson()));
  };

  return {
    ...base,
    setActive(id) {
      base.setActive(id);
      save();
    },
    upsert(card) {
      base.upsert(card);
      save();
    },
    create(partial) {
      const c = base.create(partial);
      save();
      return c;
    },
    duplicate(id) {
      const c = base.duplicate(id);
      save();
      return c;
    },
    remove(id) {
      base.remove(id);
      save();
    },
    importJson(data) {
      base.importJson(data);
      save();
    },
  };
}

