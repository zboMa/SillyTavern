import type { WorldInfoEntry, WorldInfoSettings } from '../../features/worldinfo/model';

export const world_info_insertion_strategy = {
  evenly: 0,
  character_first: 1,
  global_first: 2,
} as const;

export const world_info_logic = {
  AND_ANY: 0,
  NOT_ALL: 1,
  NOT_ANY: 2,
  AND_ALL: 3,
} as const;

export const scan_state = {
  NONE: 0,
  INITIAL: 1,
  RECURSION: 2,
  MIN_ACTIVATIONS: 3,
} as const;

export type WIScanEntry = WorldInfoEntry & {
  // Normalized keys
  key: string[];
  keysecondary: string[];
  selectiveLogic: number;
  scanDepth?: number;
};

export type WIGlobalScanData = {
  personaDescription?: string;
  characterDescription?: string;
  characterPersonality?: string;
  characterDepthPrompt?: string;
  scenario?: string;
  creatorNotes?: string;
  trigger?: string;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseRegexFromString(input: string): RegExp | null {
  const s = input.trim();
  if (!s.startsWith('/') || s.lastIndexOf('/') <= 0) return null;
  const last = s.lastIndexOf('/');
  const body = s.slice(1, last);
  const flags = s.slice(last + 1);
  try {
    return new RegExp(body, flags);
  } catch {
    return null;
  }
}

export class WorldInfoBuffer {
  private depthBuffer: string[] = [];
  private recurseBuffer: string[] = [];
  private injectBuffer: string[] = [];
  private skew = 0;
  private startDepth = 0;
  private globalScanData: WIGlobalScanData;

  constructor(messages: string[], globalScanData: WIGlobalScanData) {
    this.initDepthBuffer(messages);
    this.globalScanData = globalScanData;
  }

  private initDepthBuffer(messages: string[]) {
    this.depthBuffer = messages.map((m) => String(m ?? '').trim());
  }

  private transformString(str: string, entry: WIScanEntry, settings: WorldInfoSettings): string {
    const caseSensitive = entry.caseSensitive ?? settings.caseSensitive ?? false;
    return caseSensitive ? str : str.toLowerCase();
  }

  getDepth(settings: WorldInfoSettings) {
    return (settings.depth ?? 2) + this.skew;
  }

  advanceScan() {
    this.skew++;
  }

  addRecurse(message: string) {
    this.recurseBuffer.push(message);
  }

  addInject(message: string) {
    this.injectBuffer.push(message);
  }

  hasRecurse() {
    return this.recurseBuffer.length > 0;
  }

  get(entry: WIScanEntry, scanState: number, settings: WorldInfoSettings): string {
    let depth = entry.scanDepth ?? this.getDepth(settings);
    if (depth <= this.startDepth) return '';
    const slice = this.depthBuffer.slice(this.startDepth, Math.min(depth, this.depthBuffer.length));
    const MATCHER = '\x01';
    const JOINER = '\n' + MATCHER;
    let result = MATCHER + slice.join(JOINER);

    if (entry.matchPersonaDescription && this.globalScanData.personaDescription) result += JOINER + this.globalScanData.personaDescription;
    if (entry.matchCharacterDescription && this.globalScanData.characterDescription) result += JOINER + this.globalScanData.characterDescription;
    if (entry.matchCharacterPersonality && this.globalScanData.characterPersonality) result += JOINER + this.globalScanData.characterPersonality;
    if (entry.matchCharacterDepthPrompt && this.globalScanData.characterDepthPrompt) result += JOINER + this.globalScanData.characterDepthPrompt;
    if (entry.matchScenario && this.globalScanData.scenario) result += JOINER + this.globalScanData.scenario;
    if (entry.matchCreatorNotes && this.globalScanData.creatorNotes) result += JOINER + this.globalScanData.creatorNotes;

    if (this.injectBuffer.length) result += JOINER + this.injectBuffer.join(JOINER);
    if (this.recurseBuffer.length && scanState !== scan_state.MIN_ACTIVATIONS) result += JOINER + this.recurseBuffer.join(JOINER);
    return result;
  }

  matchKeys(haystack: string, needle: string, entry: WIScanEntry, settings: WorldInfoSettings): boolean {
    const keyRegex = parseRegexFromString(needle);
    if (keyRegex) return keyRegex.test(haystack);

    haystack = this.transformString(haystack, entry, settings);
    const transformed = this.transformString(needle, entry, settings);
    const matchWholeWords = entry.matchWholeWords ?? settings.matchWholeWords ?? false;

    if (matchWholeWords) {
      const keyWords = transformed.split(/\s+/);
      if (keyWords.length > 1) return haystack.includes(transformed);
      const re = new RegExp(`(?:^|\\W)(${escapeRegex(transformed)})(?:$|\\W)`);
      return re.test(haystack);
    }
    return haystack.includes(transformed);
  }

  getScore(entry: WIScanEntry, scanState: number, settings: WorldInfoSettings): number {
    const bufferState = this.get(entry, scanState, settings);
    const primary = entry.key ?? [];
    const secondary = entry.keysecondary ?? [];
    let primaryScore = 0;
    let secondaryScore = 0;
    for (const k of primary) if (this.matchKeys(bufferState, k, entry, settings)) primaryScore++;
    for (const k of secondary) if (this.matchKeys(bufferState, k, entry, settings)) secondaryScore++;
    if (!primary.length) return 0;

    if (secondary.length > 0) {
      switch (entry.selectiveLogic) {
        case world_info_logic.AND_ANY:
          return primaryScore + secondaryScore;
        case world_info_logic.NOT_ANY:
          return secondaryScore > 0 ? 0 : primaryScore;
        case world_info_logic.NOT_ALL:
          return secondaryScore === secondary.length ? 0 : primaryScore;
        case world_info_logic.AND_ALL:
          return secondaryScore === secondary.length ? primaryScore + secondaryScore : primaryScore;
        default:
          return primaryScore;
      }
    }
    return primaryScore;
  }
}

export type WIActivated = {
  activated: WIScanEntry[];
  matchedEntryIds: string[];
  explain: {
    logs: Record<string, string[]>;
    budgetUsedTokens: number;
    budgetCapTokens: number;
    overflowed: boolean;
    entriesBySource: Record<string, number>;
  };
};

export function normalizeEntry(e: WorldInfoEntry): WIScanEntry {
  return {
    ...e,
    key: String(e.keys ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    keysecondary: String((e as any).secondary_keys ?? (e as any).secondaryKeys ?? (e as any).secondary_keys_text ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    selectiveLogic: (e as any).selectiveLogic ?? world_info_logic.AND_ANY,
    scanDepth: (e as any).scan_depth ?? e.depth ?? undefined,
  };
}

export async function checkWorldInfo(params: {
  entries: WIScanEntry[];
  settings: WorldInfoSettings & {
    minActivations?: number;
    minActivationsDepthMax?: number;
    maxRecursionSteps?: number;
  };
  messages: string[];
  globalScanData: WIGlobalScanData;
  maxContextTokens: number;
  countTokens: (text: string) => Promise<number>;
}): Promise<WIActivated> {
  const { entries, settings, messages, globalScanData, maxContextTokens, countTokens } = params;
  const buffer = new WorldInfoBuffer(messages, globalScanData);
  const logs: Record<string, string[]> = {};
  const allActivated = new Map<string, WIScanEntry>();

  const minActivations = settings.minActivations ?? 0;
  const minDepthMax = settings.minActivationsDepthMax ?? 0;
  const maxRecSteps = settings.maxRecursionSteps ?? 0;
  const budgetPercent = typeof (settings as any).budgetPercent === 'number' ? Number((settings as any).budgetPercent) : 0;
  let budget = Math.round((budgetPercent * maxContextTokens) / 100) || 1;
  const budgetCapSetting = typeof (settings as any).budgetCap === 'number' && (settings as any).budgetCap > 0 ? Number((settings as any).budgetCap) : 0;
  if (budgetCapSetting > 0 && budget > budgetCapSetting) budget = budgetCapSetting;

  let tokenBudgetOverflowed = false;
  let allActivatedText = '';
  let overflowed = false;
  const entriesBySource: Record<string, number> = {};

  let scanState: number = scan_state.INITIAL;
  let step = 0;

  while (true) {
    step++;
    // In original: if maxRecursionSteps is non-zero min activations are disabled, and vice versa.
    if (maxRecSteps && step > maxRecSteps) break;

    const activatedNow = new Set<WIScanEntry>();
    // Deterministic iteration order; matches original rough behavior (sort by priority/order before checks).
    const sorted = entries.slice().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const entry of sorted) {
      if (!entry.enabled) continue;
      const score = buffer.getScore(entry, scanState, settings);
      if (score <= 0) continue;

      // probability gate (0-100). If useProbability is false or probability is null, always pass.
      const useProb = Boolean((entry as any).useProbability ?? false);
      const prob = (entry as any).probability;
      if (useProb && typeof prob === 'number' && isFinite(prob)) {
        const p = Math.max(0, Math.min(100, Number(prob)));
        const roll = Math.random() * 100;
        if (roll > p) {
          logs[entry.id] = logs[entry.id] ?? [];
          logs[entry.id].push(`skipped(probability=${p},roll=${roll.toFixed(1)})`);
          continue;
        }
      }

      activatedNow.add(entry);
      logs[entry.id] = logs[entry.id] ?? [];
      logs[entry.id].push(`candidate(score=${score},state=${scanState})`);
    }

    // budget checks happen after activation, in activation-order; this mirrors original behavior more closely.
    let newEntries = [...activatedNow].sort((a, b) => sorted.indexOf(a) - sorted.indexOf(b));

    // group scoring: when enabled, keep only the highest groupWeight per group unless groupOverride is true.
    // Deterministic simplified behavior.
    const useGroupScoring = Boolean((settings as any).useGroupScoring ?? false);
    if (useGroupScoring) {
      const bestByGroup = new Map<string, WIScanEntry>();
      const keep = new Set<WIScanEntry>();
      for (const e of newEntries) {
        const group = String((e as any).group ?? '').trim();
        const groupOverride = Boolean((e as any).groupOverride ?? false);
        if (!group) {
          keep.add(e);
          continue;
        }
        if (groupOverride) {
          keep.add(e);
          continue;
        }
        const w = typeof (e as any).groupWeight === 'number' ? Number((e as any).groupWeight) : 100;
        const existing = bestByGroup.get(group);
        if (!existing) {
          bestByGroup.set(group, e);
          continue;
        }
        const ew = typeof (existing as any).groupWeight === 'number' ? Number((existing as any).groupWeight) : 100;
        if (w > ew) bestByGroup.set(group, e);
      }
      for (const e of bestByGroup.values()) keep.add(e);
      newEntries = newEntries.filter((e) => keep.has(e));
    }
    let ignoresBudgetRemaining = newEntries.filter((e) => Boolean((e as any).ignoreBudget ?? false)).length;
    const textToScanTokens = await countTokens(allActivatedText);
    let newContent = '';
    const activatedThisPass = new Set<WIScanEntry>();
    for (const entry of newEntries) {
      const ignoreBudget = Boolean((entry as any).ignoreBudget ?? false);
      ignoresBudgetRemaining -= ignoreBudget ? 1 : 0;

      if (tokenBudgetOverflowed && !ignoreBudget) {
        if (ignoresBudgetRemaining > 0) continue;
        break;
      }

      const content = String(entry.content ?? '');
      newContent += `${content}\n`;
      if (!ignoreBudget) {
        const newTokens = await countTokens(newContent);
        if (textToScanTokens + newTokens >= budget) {
          tokenBudgetOverflowed = true;
          overflowed = true;
          logs[entry.id] = logs[entry.id] ?? [];
          logs[entry.id].push(`skipped(budget_overflow budget=${budget},used=${textToScanTokens},need=${newTokens})`);
          continue;
        }
      }

      activatedThisPass.add(entry);
      allActivatedText += `${content}\n`;
      allActivated.set(entry.id, entry);
      logs[entry.id] = logs[entry.id] ?? [];
      logs[entry.id].push(`accepted(state=${scanState})`);
      const src = String((entry as any).source ?? 'unknown');
      entriesBySource[src] = (entriesBySource[src] ?? 0) + 1;
    }

    // recursion: activated entries can inject their content for subsequent scans
    if (settings.recursive && activatedThisPass.size > 0 && !tokenBudgetOverflowed) {
      scanState = scan_state.RECURSION;
      for (const e of activatedThisPass) {
        buffer.addRecurse(e.content);
      }
      continue;
    }

    // min activations: widen scan depth
    if (!maxRecSteps && minActivations > 0 && allActivated.size < minActivations && !tokenBudgetOverflowed) {
      scanState = scan_state.MIN_ACTIVATIONS;
      buffer.advanceScan();
      const d = buffer.getDepth(settings);
      if (minDepthMax > 0 && d > minDepthMax) break;
      continue;
    }

    break;
  }

  const activated = [...allActivated.values()];
  const matchedEntryIds = activated.map((e) => e.id);
  const usedTokens = await countTokens(allActivatedText);
  return { activated, matchedEntryIds, explain: { logs, budgetUsedTokens: usedTokens, budgetCapTokens: budget, overflowed, entriesBySource } };
}

