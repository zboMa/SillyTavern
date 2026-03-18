import type { CharacterCard } from '../../core/characters/model';

export type MacrosContext = {
  character?: CharacterCard | null;
  now?: Date;
};

export type MacrosCapability = {
  render: (text: string, ctx: MacrosContext) => string;
};

export function createMacros(): MacrosCapability {
  function render(text: string, ctx: MacrosContext): string {
    const c = ctx.character;
    return String(text ?? '')
      .replaceAll('{{char}}', c?.name ?? '')
      .replaceAll('{{character}}', c?.name ?? '')
      .replaceAll('{{scenario}}', c?.scenario ?? '')
      .replaceAll('{{date}}', (ctx.now ?? new Date()).toISOString().slice(0, 10));
  }
  return { render };
}

