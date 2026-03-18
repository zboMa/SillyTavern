import type { KeyValueStorage } from './storage';
import type { EventBus } from '../../core/events/EventBus';

export type RegexPlacement = 'USER_INPUT' | 'WORLD_INFO' | 'AI_OUTPUT' | 'REASONING';

export type RegexScope = 'global' | 'character' | 'chat';

export type RegexRule = {
  id: string;
  name: string;
  placement: RegexPlacement;
  scope: RegexScope;
  find: string;
  replace: string;
  flags: string; // e.g. "gi"
  enabled: boolean;
};

type PersistedRegexV1 = {
  version: 1;
  rules: RegexRule[];
};

export type RegexCapability = {
  list: () => RegexRule[];
  upsert: (rule: RegexRule) => void;
  remove: (id: string) => void;
  apply: (placement: RegexPlacement, text: string, ctx?: { characterId?: string | null; chatSessionId?: string | null }) => string;
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function createPersistedRegex(storage: KeyValueStorage, events?: EventBus, key = 'regex.v1'): RegexCapability {
  const rules: RegexRule[] = [];
  const emit = () => events?.emit('regex.changed', {});

  function save() {
    const payload: PersistedRegexV1 = { version: 1, rules: rules.slice() };
    storage.setString(key, JSON.stringify(payload));
    emit();
  }

  function load() {
    const persisted = safeParse<PersistedRegexV1>(storage.getString(key));
    if (persisted?.version === 1 && Array.isArray(persisted.rules)) {
      rules.splice(0, rules.length, ...persisted.rules);
    }
  }

  function list() {
    return rules.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  function upsert(rule: RegexRule) {
    const idx = rules.findIndex((r) => r.id === rule.id);
    if (idx >= 0) rules[idx] = rule;
    else rules.push(rule);
    save();
  }

  function remove(id: string) {
    const idx = rules.findIndex((r) => r.id === id);
    if (idx >= 0) rules.splice(idx, 1);
    save();
  }

  function apply(placement: RegexPlacement, text: string, ctx?: { characterId?: string | null; chatSessionId?: string | null }) {
    let out = String(text ?? '');
    for (const r of rules) {
      if (!r.enabled) continue;
      if (r.placement !== placement) continue;
      if (r.scope === 'character' && !ctx?.characterId) continue;
      if (r.scope === 'chat' && !ctx?.chatSessionId) continue;
      try {
        const re = new RegExp(r.find, r.flags || '');
        out = out.replace(re, r.replace ?? '');
      } catch {
        // ignore invalid regex
      }
    }
    return out;
  }

  load();
  if (!rules.length) {
    upsert({
      id: crypto.randomUUID(),
      name: 'Example: trim trailing spaces',
      placement: 'USER_INPUT',
      scope: 'global',
      find: '\\\\s+$',
      replace: '',
      flags: 'g',
      enabled: true,
    });
  }

  return { list, upsert, remove, apply };
}

