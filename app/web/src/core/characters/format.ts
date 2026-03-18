import type { CharacterCard } from './model';

export type CharacterExportV1 = {
  version: 1;
  exportedAt: number;
  card: CharacterCard;
};

export function exportCharacter(card: CharacterCard): CharacterExportV1 {
  return {
    version: 1,
    exportedAt: Date.now(),
    card,
  };
}

export function importCharacter(data: unknown): CharacterCard | null {
  // v1 wrapper
  const v1 = data as Partial<CharacterExportV1>;
  if (v1 && v1.version === 1 && v1.card && typeof v1.card === 'object') {
    return normalizeCharacter(v1.card as CharacterCard);
  }

  // raw card fallback (early iteration)
  if (data && typeof data === 'object' && 'name' in (data as any)) {
    return normalizeCharacter(data as any);
  }

  return null;
}

export function normalizeCharacter(input: Partial<CharacterCard>): CharacterCard {
  const now = Date.now();
  const id = typeof input.id === 'string' && input.id ? input.id : crypto.randomUUID();

  return {
    id,
    name: String(input.name ?? 'Imported Character'),
    description: String(input.description ?? ''),
    personality: String(input.personality ?? ''),
    scenario: String(input.scenario ?? ''),
    firstMessage: String(input.firstMessage ?? ''),
    exampleMessages: String(input.exampleMessages ?? ''),
    creatorNotes: String(input.creatorNotes ?? ''),
    systemPrompt: String(input.systemPrompt ?? ''),
    favorite: Boolean(input.favorite ?? false),
    tags: Array.isArray(input.tags) ? (input.tags as any[]).map((t) => ({ id: String((t as any).id ?? (t as any).name ?? ''), name: String((t as any).name ?? '') })).filter((t) => t.name) : [],
    worldInfoId: (input.worldInfoId ?? null) as any,
    avatarUrl: (input.avatarUrl ?? null) as any,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : now,
  };
}

