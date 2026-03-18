import type { KeyValueStorage } from './storage';
import type { EventBus } from '../../core/events/EventBus';

export type ChatCompletionPreset = {
  id: string;
  name: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  seed?: number;
  stop?: string[];
};

export type PresetManagerState = {
  apiId: string;
  activeId: string | null;
  presets: ChatCompletionPreset[];
};

type PersistedPresetsV2 = {
  version: 2;
  managers: Record<string, PresetManagerState>;
};

export type MasterSectionId = 'instruct' | 'context' | 'sysprompt' | 'reasoning' | 'srw';

export type MasterSectionData =
  | { name: string; input_sequence: string; output_sequence: string; [k: string]: unknown } // instruct
  | { name: string; story_string: string; [k: string]: unknown } // context
  | { name: string; content: string; [k: string]: unknown } // sysprompt
  | { name: string; prefix: string; suffix: string; separator: string; [k: string]: unknown } // reasoning
  | { value: string; show: boolean; [k: string]: unknown }; // srw

export type MasterSectionsState = Partial<Record<MasterSectionId, MasterSectionData>>;

type PersistedPresetsV3 = {
  version: 3;
  managers: Record<string, PresetManagerState>;
  master: MasterSectionsState;
};

export type PresetsCapability = {
  list: (apiId: string) => ChatCompletionPreset[];
  listApiIds: () => string[];
  getActive: (apiId: string) => ChatCompletionPreset | null;
  setActive: (apiId: string, id: string) => void;
  upsert: (apiId: string, p: ChatCompletionPreset) => void;
  remove: (apiId: string, id: string) => void;
  ensureManager: (apiId: string) => PresetManagerState;
  findByName: (apiId: string, name: string) => ChatCompletionPreset | null;
  autoSelectByName: (apiId: string, name: string) => ChatCompletionPreset | null;
  getMaster: () => MasterSectionsState;
  setMaster: (section: MasterSectionId, data: MasterSectionData) => void;
  performMasterImport: (data: unknown) => boolean;
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

export function createPersistedPresets(storage: KeyValueStorage, events?: EventBus, key = 'presets.v1'): PresetsCapability {
  const managers: Record<string, PresetManagerState> = {};
  let master: MasterSectionsState = {};
  const emit = () => events?.emit('presets.changed', {});

  function normName(s: string) {
    return String(s ?? '').trim().toLowerCase();
  }

  function save() {
    const payload: PersistedPresetsV3 = { version: 3, managers, master };
    storage.setString(key, JSON.stringify(payload));
    emit();
  }

  function load() {
    const raw = storage.getString(key);
    const persistedV3 = safeParse<PersistedPresetsV3>(raw);
    if (persistedV3?.version === 3 && persistedV3.managers && typeof persistedV3.managers === 'object') {
      for (const [apiId, st] of Object.entries(persistedV3.managers)) {
        if (!st || typeof st !== 'object') continue;
        managers[apiId] = {
          apiId,
          activeId: typeof (st as any).activeId === 'string' || (st as any).activeId === null ? ((st as any).activeId as any) : null,
          presets: Array.isArray((st as any).presets) ? ((st as any).presets as any[]) : [],
        };
      }
      master = persistedV3.master && typeof persistedV3.master === 'object' ? (persistedV3.master as any) : {};
    } else {
      // v1 migration: one global list -> openai manager by default
      const persistedV1 = safeParse<{ version: 1; activeId: string | null; presets: ChatCompletionPreset[] }>(raw);
      if (persistedV1?.version === 1 && Array.isArray(persistedV1.presets)) {
        managers.openai = {
          apiId: 'openai',
          activeId: typeof persistedV1.activeId === 'string' || persistedV1.activeId === null ? persistedV1.activeId : null,
          presets: persistedV1.presets.slice(),
        };
      }
    }

    // Ensure at least one manager exists
    if (!Object.keys(managers).length) {
      managers.openai = {
        apiId: 'openai',
        activeId: null,
        presets: [{ id: crypto.randomUUID(), name: 'Default', temperature: 0.7, top_p: 1, max_tokens: 512, presence_penalty: 0, frequency_penalty: 0 }],
      };
      managers.openai.activeId = managers.openai.presets[0].id;
      save();
    } else {
      // Ensure each manager has a valid activeId
      for (const st of Object.values(managers)) {
        if (!st.presets.length) {
          st.presets.push({ id: crypto.randomUUID(), name: 'Default', temperature: 0.7, top_p: 1, max_tokens: 512, presence_penalty: 0, frequency_penalty: 0 });
        }
        if (st.activeId && !st.presets.some((p) => p.id === st.activeId)) {
          st.activeId = st.presets[0]?.id ?? null;
        }
        if (!st.activeId) st.activeId = st.presets[0]?.id ?? null;
      }
      save();
    }
  }

  function ensureManager(apiId: string): PresetManagerState {
    const id = String(apiId || 'openai');
    if (!managers[id]) {
      const p: ChatCompletionPreset = { id: crypto.randomUUID(), name: 'Default', temperature: 0.7, top_p: 1, max_tokens: 512, presence_penalty: 0, frequency_penalty: 0 };
      managers[id] = { apiId: id, activeId: p.id, presets: [p] };
      save();
    }
    return managers[id];
  }

  function list(apiId: string) {
    const st = ensureManager(apiId);
    return st.presets.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  function listApiIds() {
    return Object.keys(managers).slice().sort((a, b) => a.localeCompare(b));
  }

  function getActive(apiId: string) {
    const st = ensureManager(apiId);
    return st.activeId ? st.presets.find((p) => p.id === st.activeId) ?? null : null;
  }

  function setActive(apiId: string, id: string) {
    const st = ensureManager(apiId);
    if (st.presets.some((p) => p.id === id)) {
      st.activeId = id;
      save();
    }
  }

  function upsert(apiId: string, p: ChatCompletionPreset) {
    const st = ensureManager(apiId);
    const idx = st.presets.findIndex((x) => x.id === p.id);
    if (idx >= 0) st.presets[idx] = p;
    else st.presets.push(p);
    if (!st.activeId) st.activeId = p.id;
    save();
  }

  function remove(apiId: string, id: string) {
    const st = ensureManager(apiId);
    const idx = st.presets.findIndex((x) => x.id === id);
    if (idx >= 0) st.presets.splice(idx, 1);
    if (st.activeId === id) st.activeId = st.presets[0]?.id ?? null;
    if (!st.presets.length) {
      const p: ChatCompletionPreset = { id: crypto.randomUUID(), name: 'Default', temperature: 0.7, top_p: 1, max_tokens: 512, presence_penalty: 0, frequency_penalty: 0 };
      st.presets.push(p);
      st.activeId = p.id;
    }
    save();
  }

  function findByName(apiId: string, name: string): ChatCompletionPreset | null {
    const st = ensureManager(apiId);
    const n = normName(name);
    if (!n) return null;
    return st.presets.find((p) => normName(p.name) === n) ?? null;
  }

  function autoSelectByName(apiId: string, name: string): ChatCompletionPreset | null {
    const st = ensureManager(apiId);
    const found = findByName(apiId, name);
    if (!found) return null;
    if (st.activeId === found.id) return found;
    st.activeId = found.id;
    save();
    return found;
  }

  function getMaster() {
    return master;
  }

  function setMaster(section: MasterSectionId, data: MasterSectionData) {
    master = { ...master, [section]: data };
    save();
  }

  function isPossiblyInstructData(d: any) {
    return d && typeof d === 'object' && ['name', 'input_sequence', 'output_sequence'].every((k) => k in d);
  }
  function isPossiblyContextData(d: any) {
    return d && typeof d === 'object' && ['name', 'story_string'].every((k) => k in d);
  }
  function isPossiblySystemPromptData(d: any) {
    return d && typeof d === 'object' && ['name', 'content'].every((k) => k in d);
  }
  function isPossiblyReasoningData(d: any) {
    return d && typeof d === 'object' && ['name', 'prefix', 'suffix', 'separator'].every((k) => k in d);
  }
  function isPossiblyStartReplyWithData(d: any) {
    return d && typeof d === 'object' && 'value' in d && 'show' in d;
  }

  function performMasterImport(data: unknown): boolean {
    const d: any = data;
    if (!d || typeof d !== 'object') return false;

    // Legacy single-section files
    if (isPossiblyInstructData(d)) {
      setMaster('instruct', d);
      return true;
    }
    if (isPossiblyContextData(d)) {
      setMaster('context', d);
      return true;
    }
    if (isPossiblySystemPromptData(d)) {
      setMaster('sysprompt', d);
      return true;
    }
    if (isPossiblyReasoningData(d)) {
      setMaster('reasoning', d);
      return true;
    }
    if (isPossiblyStartReplyWithData(d)) {
      setMaster('srw', d);
      return true;
    }

    // Master export bundle style: { instruct: {...}, context: {...}, ... }
    const next: MasterSectionsState = { ...master };
    let any = false;
    const candidates: MasterSectionId[] = ['instruct', 'context', 'sysprompt', 'reasoning', 'srw'];
    for (const k of candidates) {
      if (!(k in d)) continue;
      const v = d[k];
      if (k === 'instruct' && isPossiblyInstructData(v)) {
        (next as any)[k] = v;
        any = true;
      }
      if (k === 'context' && isPossiblyContextData(v)) {
        (next as any)[k] = v;
        any = true;
      }
      if (k === 'sysprompt' && isPossiblySystemPromptData(v)) {
        (next as any)[k] = v;
        any = true;
      }
      if (k === 'reasoning' && isPossiblyReasoningData(v)) {
        (next as any)[k] = v;
        any = true;
      }
      if (k === 'srw' && isPossiblyStartReplyWithData(v)) {
        (next as any)[k] = v;
        any = true;
      }
    }
    if (any) {
      master = next;
      save();
      return true;
    }
    return false;
  }

  function exportJson(): PersistedPresetsV3 {
    return { version: 3, managers, master };
  }

  function importJson(data: unknown) {
    // allow master import shapes too
    if (performMasterImport(data)) return;

    const d = data as Partial<PersistedPresetsV3>;
    if (!d || (d.version !== 3 && d.version !== 2) || !d.managers || typeof d.managers !== 'object') {
      throw new Error('Invalid presets export');
    }
    for (const k of Object.keys(managers)) delete managers[k];
    for (const [apiId, st] of Object.entries(d.managers as any)) {
      managers[apiId] = {
        apiId,
        activeId: typeof (st as any).activeId === 'string' || (st as any).activeId === null ? ((st as any).activeId as any) : null,
        presets: Array.isArray((st as any).presets) ? ((st as any).presets as any[]) : [],
      };
    }
    if ((d as any).version === 3) {
      master = (d as any).master && typeof (d as any).master === 'object' ? ((d as any).master as any) : {};
    }
    save();
  }

  load();
  return {
    list,
    listApiIds,
    getActive,
    setActive,
    upsert,
    remove,
    ensureManager,
    findByName,
    autoSelectByName,
    getMaster,
    setMaster,
    performMasterImport,
    exportJson,
    importJson,
  };
}

