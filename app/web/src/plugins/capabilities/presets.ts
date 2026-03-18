import type { KeyValueStorage } from './storage';
import type { EventBus } from '../../core/events/EventBus';

export type ChatCompletionPreset = {
  id: string;
  name: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
};

type PersistedPresetsV1 = {
  version: 1;
  activeId: string | null;
  presets: ChatCompletionPreset[];
};

export type PresetsCapability = {
  list: () => ChatCompletionPreset[];
  getActive: () => ChatCompletionPreset | null;
  setActive: (id: string) => void;
  upsert: (p: ChatCompletionPreset) => void;
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

export function createPersistedPresets(storage: KeyValueStorage, events?: EventBus, key = 'presets.v1'): PresetsCapability {
  const presets: ChatCompletionPreset[] = [];
  let activeId: string | null = null;
  const emit = () => events?.emit('presets.changed', { activeId });

  function save() {
    const payload: PersistedPresetsV1 = { version: 1, activeId, presets: presets.slice() };
    storage.setString(key, JSON.stringify(payload));
    emit();
  }

  function load() {
    const persisted = safeParse<PersistedPresetsV1>(storage.getString(key));
    if (persisted?.version === 1 && Array.isArray(persisted.presets)) {
      presets.splice(0, presets.length, ...persisted.presets);
      activeId = typeof persisted.activeId === 'string' || persisted.activeId === null ? persisted.activeId : null;
    }
    if (!presets.length) {
      const p: ChatCompletionPreset = { id: crypto.randomUUID(), name: 'Default', temperature: 0.7, top_p: 1, max_tokens: 512 };
      presets.push(p);
      activeId = p.id;
      save();
    } else if (activeId && !presets.some((p) => p.id === activeId)) {
      activeId = presets[0]?.id ?? null;
      save();
    }
  }

  function list() {
    return presets.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  function getActive() {
    return activeId ? presets.find((p) => p.id === activeId) ?? null : null;
  }

  function setActive(id: string) {
    if (presets.some((p) => p.id === id)) {
      activeId = id;
      save();
    }
  }

  function upsert(p: ChatCompletionPreset) {
    const idx = presets.findIndex((x) => x.id === p.id);
    if (idx >= 0) presets[idx] = p;
    else presets.push(p);
    if (!activeId) activeId = p.id;
    save();
  }

  function remove(id: string) {
    const idx = presets.findIndex((x) => x.id === id);
    if (idx >= 0) presets.splice(idx, 1);
    if (activeId === id) activeId = presets[0]?.id ?? null;
    save();
  }

  load();
  return { list, getActive, setActive, upsert, remove };
}

