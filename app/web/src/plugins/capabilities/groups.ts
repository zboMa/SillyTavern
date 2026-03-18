import type { KeyValueStorage } from './storage';
import type { EventBus } from '../../core/events/EventBus';

export type Group = {
  id: string;
  name: string;
  memberCharacterIds: string[];
  createdAt: number;
  updatedAt: number;
};

type PersistedGroupsV1 = {
  version: 1;
  activeId: string | null;
  groups: Group[];
};

export type GroupsCapability = {
  list: () => Group[];
  getActive: () => Group | null;
  setActive: (id: string) => void;
  create: (name: string) => Group;
  upsert: (g: Group) => void;
  remove: (id: string) => void;
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function createPersistedGroups(storage: KeyValueStorage, events?: EventBus, key = 'groups.v1'): GroupsCapability {
  const groups: Group[] = [];
  let activeId: string | null = null;
  const emit = () => events?.emit('groups.changed', { activeId });

  function save() {
    const payload: PersistedGroupsV1 = { version: 1, activeId, groups: groups.slice() };
    storage.setString(key, JSON.stringify(payload));
    emit();
  }

  function load() {
    const persisted = safeParse<PersistedGroupsV1>(storage.getString(key));
    if (persisted?.version === 1 && Array.isArray(persisted.groups)) {
      groups.splice(0, groups.length, ...persisted.groups);
      activeId = typeof persisted.activeId === 'string' || persisted.activeId === null ? persisted.activeId : null;
    }
  }

  function list() {
    return groups.slice().sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
  }

  function getActive() {
    return activeId ? groups.find((g) => g.id === activeId) ?? null : null;
  }

  function setActive(id: string) {
    if (groups.some((g) => g.id === id)) {
      activeId = id;
      save();
    }
  }

  function create(name: string) {
    const now = Date.now();
    const g: Group = { id: crypto.randomUUID(), name, memberCharacterIds: [], createdAt: now, updatedAt: now };
    groups.unshift(g);
    activeId = g.id;
    save();
    return g;
  }

  function upsert(g: Group) {
    const now = Date.now();
    const next = { ...g, updatedAt: now };
    const idx = groups.findIndex((x) => x.id === g.id);
    if (idx >= 0) groups[idx] = next;
    else groups.unshift(next);
    activeId = next.id;
    save();
  }

  function remove(id: string) {
    const idx = groups.findIndex((g) => g.id === id);
    if (idx >= 0) groups.splice(idx, 1);
    if (activeId === id) activeId = groups[0]?.id ?? null;
    save();
  }

  load();
  return { list, getActive, setActive, create, upsert, remove };
}

