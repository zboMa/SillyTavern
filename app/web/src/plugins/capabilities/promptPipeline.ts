import type { CharactersCapability } from './characters';
import type { WorldInfoCapability } from './worldinfo';
import type { MacrosCapability } from './macros';
import type { RegexCapability } from './regex';
import type { PresetsCapability } from './presets';

export type PromptPipelineCapability = {
  buildSystemPrompt: (opts: { messages: string[]; chatSessionId?: string | null }) => string;
  applyUserInput: (text: string) => string;
};

export function createPromptPipeline(
  worldinfo: WorldInfoCapability,
  characters: CharactersCapability,
  macros: MacrosCapability,
  regex?: RegexCapability,
  presets?: PresetsCapability,
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

    const master = presets?.getMaster?.() ?? {};
    const sys = typeof (master as any).sysprompt?.content === 'string' ? String((master as any).sysprompt.content) : '';
    const srwShow = Boolean((master as any).srw?.show ?? false);
    const srwValue = typeof (master as any).srw?.value === 'string' ? String((master as any).srw.value) : '';

    const sections: string[] = [];
    if (sys.trim()) sections.push(sys.trim());
    if (srwShow && srwValue.trim()) sections.push(`Start reply with:\n${srwValue.trim()}`);
    if (lore.trim()) sections.push(lore.trim());

    const combined = sections.join('\n\n').trim();
    const rendered = macros.render(combined, { character: c });
    return regex
      ? regex.apply('WORLD_INFO', rendered, {
          characterId: c?.id ?? null,
          chatSessionId: opts.chatSessionId ?? null,
          isPrompt: true,
        })
      : rendered;
  }

  function applyUserInput(text: string) {
    const rendered = macros.render(text, { character: characters.getActive() });
    const c = characters.getActive();
    return regex
      ? regex.apply('USER_INPUT', rendered, {
          characterId: c?.id ?? null,
          isPrompt: true,
        })
      : rendered;
  }

  return { buildSystemPrompt, applyUserInput };
}

