import type { KeyValueStorage } from './storage';
import type { EventBus } from '../../core/events/EventBus';
import type { CharactersCapability } from './characters';
import type { CharacterRegexScript } from '../../core/characters/model';

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
  apply: (
    placement: RegexPlacement,
    text: string,
    ctx?: { characterId?: string | null; chatSessionId?: string | null; isMarkdown?: boolean; isPrompt?: boolean; isEdit?: boolean; depth?: number },
  ) => string;
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseRegexFromString(input: string): RegExp | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (s.startsWith('/') && s.lastIndexOf('/') > 0) {
    const last = s.lastIndexOf('/');
    const body = s.slice(1, last);
    const flags = s.slice(last + 1);
    try {
      return new RegExp(body, flags);
    } catch {
      return null;
    }
  }
  try {
    return new RegExp(s, 'g');
  } catch {
    return null;
  }
}

function mapPlacementToStNumber(p: RegexPlacement): number {
  switch (p) {
    case 'USER_INPUT':
      return 1;
    case 'AI_OUTPUT':
      return 2;
    case 'WORLD_INFO':
      return 5;
    case 'REASONING':
      return 6;
  }
}

function applyCharacterRegexScript(script: CharacterRegexScript, rawString: string): string {
  if (!script || script.disabled) return rawString;
  if (!script.findRegex) return rawString;
  if (!rawString) return rawString;

  const re = parseRegexFromString(script.findRegex);
  if (!re) return rawString;

  const trimStrings = Array.isArray(script.trimStrings) ? script.trimStrings : [];
  const replaceString = String(script.replaceString ?? '').replace(/{{match}}/gi, '$0');
  return rawString.replace(re, (...args: any[]) => {
    const groups = args[args.length - 1];
    const getGroup = (num?: number, name?: string) => {
      let v: any = '';
      if (typeof num === 'number') v = args[num];
      else if (name && groups && typeof groups === 'object') v = groups[name];
      v = String(v ?? '');
      for (const t of trimStrings) v = v.replaceAll(String(t ?? ''), '');
      return v;
    };
    const replaced = replaceString.replaceAll(/\$(\d+)|\$<([^>]+)>/g, (_m: string, num: string, groupName: string) => {
      if (num) return getGroup(Number(num));
      if (groupName) return getGroup(undefined, groupName);
      return '';
    });
    return replaced;
  });
}

function applyCharacterRegexScripts(params: {
  scripts: CharacterRegexScript[];
  placement: RegexPlacement;
  text: string;
  ctx?: { isMarkdown?: boolean; isPrompt?: boolean; isEdit?: boolean; depth?: number };
}): string {
  const placementNum = mapPlacementToStNumber(params.placement);
  let out = params.text;
  for (const s of params.scripts) {
    if (!s || s.disabled) continue;
    const placements = Array.isArray(s.placement) ? s.placement : [];
    if (!placements.includes(placementNum)) continue;

    const isMarkdown = Boolean(params.ctx?.isMarkdown);
    const isPrompt = Boolean(params.ctx?.isPrompt);
    if ((s.markdownOnly && !isMarkdown) || (s.promptOnly && !isPrompt)) continue;
    if (params.ctx?.isEdit && !s.runOnEdit) continue;

    const depth = params.ctx?.depth;
    if (typeof depth === 'number') {
      if (typeof s.minDepth === 'number' && s.minDepth >= -1 && depth < s.minDepth) continue;
      if (typeof s.maxDepth === 'number' && s.maxDepth >= 0 && depth > s.maxDepth) continue;
    }

    out = applyCharacterRegexScript(s, out);
  }
  return out;
}

export function createPersistedRegex(storage: KeyValueStorage, events?: EventBus, key = 'regex.v1', characters?: CharactersCapability): RegexCapability {
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

  function apply(
    placement: RegexPlacement,
    text: string,
    ctx?: { characterId?: string | null; chatSessionId?: string | null; isMarkdown?: boolean; isPrompt?: boolean; isEdit?: boolean; depth?: number },
  ) {
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

    // Character card regex scripts (imported from Tavern v2) should also affect the pipeline.
    if (ctx?.characterId && characters) {
      const c = characters.getById(ctx.characterId);
      const scripts = (c as any)?.regexScripts;
      if (Array.isArray(scripts) && scripts.length) {
        out = applyCharacterRegexScripts({ scripts, placement, text: out, ctx });
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

