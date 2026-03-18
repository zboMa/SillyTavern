import type { CharactersCapability } from './characters';
import type { WorldInfoCapability } from './worldinfo';
import type { MacrosCapability } from './macros';
import type { RegexCapability } from './regex';

export type PromptPipelineCapability = {
  buildSystemPrompt: (opts: { messages: string[]; chatSessionId?: string | null }) => string;
  applyUserInput: (text: string) => string;
};

export function createPromptPipeline(
  worldinfo: WorldInfoCapability,
  characters: CharactersCapability,
  macros: MacrosCapability,
  regex?: RegexCapability,
): PromptPipelineCapability {
  function buildSystemPrompt(opts: { messages: string[]; chatSessionId?: string | null }) {
    const wiState = worldinfo.getState();
    const globalIds = wiState.globalSelectedBookIds ?? [];
    const c = characters.getActive();
    const boundId = (c as any)?.worldInfoId ? [String((c as any).worldInfoId)] : [];
    const selected = [...new Set([...globalIds, ...boundId])];
    const globalScanData = {
      characterDescription: (c as any)?.description ?? (c as any)?.descriptionText ?? '',
      characterPersonality: (c as any)?.personality ?? '',
      characterDepthPrompt: (c as any)?.depthPrompt ?? '',
      scenario: (c as any)?.scenario ?? '',
      creatorNotes: (c as any)?.creatorNotes ?? '',
    };
    const lore = worldinfo.buildLoreText({
      selectedBookIds: selected,
      messages: opts.messages ?? [],
      globalScanData,
    });
    const rendered = macros.render(lore, { character: c });
    return regex
      ? regex.apply('WORLD_INFO', rendered, { characterId: c?.id ?? null, chatSessionId: opts.chatSessionId ?? null })
      : rendered;
  }

  function applyUserInput(text: string) {
    const rendered = macros.render(text, { character: characters.getActive() });
    const c = characters.getActive();
    return regex ? regex.apply('USER_INPUT', rendered, { characterId: c?.id ?? null }) : rendered;
  }

  return { buildSystemPrompt, applyUserInput };
}

