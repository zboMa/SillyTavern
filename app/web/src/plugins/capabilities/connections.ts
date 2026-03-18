import type { KeyValueStorage } from './storage';
import type { EventBus } from '../../core/events/EventBus';

export type ConnectionProfile = {
  id: string;
  name: string;
  chatCompletionSource: string; // e.g. 'openai'
  model: string;
  reverseProxy?: string | null;
  proxyPassword?: string | null;
  includeReasoning?: boolean;
  logprobs?: number;
};

type PersistedConnectionsV1 = {
  version: 1;
  activeId: string | null;
  profiles: ConnectionProfile[];
};

export type ConnectionsCapability = {
  list: () => ConnectionProfile[];
  getActive: () => ConnectionProfile | null;
  setActive: (id: string) => void;
  upsert: (profile: ConnectionProfile) => void;
  remove: (id: string) => void;
  exportJson: () => object;
  importJson: (data: unknown) => void;
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function createPersistedConnections(storage: KeyValueStorage, events?: EventBus, key = 'connections.v1'): ConnectionsCapability {
  const profiles: ConnectionProfile[] = [];
  let activeId: string | null = null;
  const emit = () => events?.emit('connections.changed', { activeId });

  function save() {
    const payload: PersistedConnectionsV1 = { version: 1, activeId, profiles: profiles.slice() };
    storage.setString(key, JSON.stringify(payload));
    emit();
  }

  function load() {
    const persisted = safeParse<PersistedConnectionsV1>(storage.getString(key));
    if (persisted?.version === 1 && Array.isArray(persisted.profiles)) {
      profiles.splice(0, profiles.length, ...persisted.profiles);
      activeId = typeof persisted.activeId === 'string' || persisted.activeId === null ? persisted.activeId : null;
    }
    if (!profiles.length) {
      const p: ConnectionProfile = { id: crypto.randomUUID(), name: 'Default', chatCompletionSource: 'openai', model: 'gpt-3.5-turbo' };
      profiles.push(p);
      activeId = p.id;
      save();
    } else if (activeId && !profiles.some((p) => p.id === activeId)) {
      activeId = profiles[0]?.id ?? null;
      save();
    }
  }

  function list() {
    return profiles.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  function getActive() {
    return activeId ? profiles.find((p) => p.id === activeId) ?? null : null;
  }

  function setActive(id: string) {
    if (profiles.some((p) => p.id === id)) {
      activeId = id;
      save();
    }
  }

  function upsert(profile: ConnectionProfile) {
    const idx = profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) profiles[idx] = profile;
    else profiles.push(profile);
    if (!activeId) activeId = profile.id;
    save();
  }

  function remove(id: string) {
    const idx = profiles.findIndex((p) => p.id === id);
    if (idx >= 0) profiles.splice(idx, 1);
    if (activeId === id) activeId = profiles[0]?.id ?? null;
    save();
  }

  function exportJson(): PersistedConnectionsV1 {
    return { version: 1, activeId, profiles: profiles.slice() };
  }

  function importJson(data: unknown) {
    const d = data as Partial<PersistedConnectionsV1>;
    if (!d || d.version !== 1 || !Array.isArray(d.profiles)) throw new Error('Invalid connections export');
    profiles.splice(0, profiles.length, ...d.profiles);
    activeId = typeof d.activeId === 'string' || d.activeId === null ? d.activeId : null;
    save();
  }

  load();
  return { list, getActive, setActive, upsert, remove, exportJson, importJson };
}

