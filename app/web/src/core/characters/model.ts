export type CharacterId = string;

export type CharacterTag = {
  id: string;
  name: string;
};

export type CharacterDepthPrompt = {
  depth: number;
  prompt: string;
  role: "system" | "user" | "assistant";
};

export type CharacterRegexScript = {
  id: string;
  scriptName?: string;
  findRegex?: string;
  replaceString?: string;
  trimStrings?: string[];
  placement?: number[];
  disabled?: boolean;
  markdownOnly?: boolean;
  promptOnly?: boolean;
  runOnEdit?: boolean;
  substituteRegex?: number;
  minDepth?: number;
  maxDepth?: number;
};

export type CharacterEmbeddedWorldInfoEntry = {
  keys: string[];
  secondary_keys?: string[];
  comment?: string;
  content: string;
  constant?: boolean;
  selective?: boolean;
  insertion_order?: number;
  enabled?: boolean;
  position?: string;
  extensions?: Record<string, unknown>;
  id?: number;
};

export type CharacterEmbeddedWorldInfoBook = {
  name: string;
  entries: CharacterEmbeddedWorldInfoEntry[];
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
  postHistoryInstructions: string;
  creator: string;
  alternateGreetings: string[];
  talkativeness: number;
  world: string;
  depthPrompt: CharacterDepthPrompt | null;
  regexScripts: CharacterRegexScript[];
  characterBook: CharacterEmbeddedWorldInfoBook | null;
  folder: string;

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
