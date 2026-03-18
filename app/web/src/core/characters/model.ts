export type CharacterId = string;

export type CharacterTag = {
  id: string;
  name: string;
};

export type CharacterCard = {
  id: CharacterId;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  exampleMessages: string;
  creatorNotes: string;
  systemPrompt: string;

  // UX fields
  favorite: boolean;
  tags: CharacterTag[];

  // Lorebook binding (World Info)
  worldInfoId?: string | null;

  // Chat binding (rewritten frontend)
  activeChatSessionId?: string | null;

  // Media
  avatarUrl?: string | null;

  createdAt: number;
  updatedAt: number;
};

