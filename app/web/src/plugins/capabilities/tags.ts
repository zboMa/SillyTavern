import type { Tag, TagId } from '../../core/tags/model';
import type { KeyValueStorage } from './storage';

export type TagsCapability = {
  list: () => Tag[];
  upsertByName: (name: string) => Tag;
  getById: (id: TagId) => Tag | null;
  remove: (id: TagId) => void;
  exportJson: () => object;
  importJson: (data: unknown) => void;
};

type PersistedTagsV1 = {
  version: 1;
  tags: Tag[];
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeTagId(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export function createPersistedTags(storage: KeyValueStorage, key = 'tags.v1'): TagsCapability {
  const tags: Tag[] = [];
  const now = () => Date.now();

  function load() {
    const persisted = safeParse<PersistedTagsV1>(storage.getString(key));
    if (persisted?.version === 1 && Array.isArray(persisted.tags)) {
      tags.splice(0, tags.length, ...persisted.tags);
    }
  }

  function save() {
    const payload: PersistedTagsV1 = { version: 1, tags: tags.slice().sort((a, b) => a.name.localeCompare(b.name)) };
    storage.setString(key, JSON.stringify(payload));
  }

  function list() {
    return tags.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  function getById(id: TagId) {
    return tags.find((t) => t.id === id) ?? null;
  }

  function upsertByName(name: string): Tag {
    const clean = name.trim();
    if (!clean) throw new Error('Tag name is empty');
    const id = normalizeTagId(clean);
    const existing = getById(id);
    if (existing) return existing;
    const tag: Tag = { id, name: clean, createdAt: now() };
    tags.push(tag);
    save();
    return tag;
  }

  function remove(id: TagId) {
    const idx = tags.findIndex((t) => t.id === id);
    if (idx >= 0) tags.splice(idx, 1);
    save();
  }

  function exportJson(): PersistedTagsV1 {
    return { version: 1, tags: tags.slice() };
  }

  function importJson(data: unknown) {
    const d = data as Partial<PersistedTagsV1>;
    if (!d || d.version !== 1 || !Array.isArray(d.tags)) {
      throw new Error('Invalid tags export format');
    }
    tags.splice(0, tags.length, ...d.tags);
    save();
  }

  load();
  return { list, upsertByName, getById, remove, exportJson, importJson };
}

