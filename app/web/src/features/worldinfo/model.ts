export type WorldInfoSettings = {
  depth: number;
  budgetPercent: number;
  budgetCap: number;
  recursive: boolean;
  includeNames: boolean;
  caseSensitive: boolean;
  matchWholeWords: boolean;
  minActivations: number;
  minActivationsDepthMax: number;
  maxRecursionSteps: number;
};

export type WorldInfoEntry = {
  id: string;
  keys: string; // comma-separated for now
  secondaryKeys?: string; // comma-separated
  content: string;
  enabled: boolean;
  priority: number;
  // matching options (parity subset)
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  useRegex?: boolean;
  depth?: number;
  selectiveLogic?: number;
  matchPersonaDescription?: boolean;
  matchCharacterDescription?: boolean;
  matchCharacterPersonality?: boolean;
  matchCharacterDepthPrompt?: boolean;
  matchScenario?: boolean;
  matchCreatorNotes?: boolean;
  source?: 'global' | 'character' | 'import';
};

export type WorldInfoBook = {
  id: string;
  name: string;
  entries: WorldInfoEntry[];
  createdAt: number;
  updatedAt: number;
};

export type WorldInfoState = {
  books: WorldInfoBook[];
  globalSelectedBookIds: string[];
  settings: WorldInfoSettings;
};

export const defaultWorldInfoState = (): WorldInfoState => ({
  books: [],
  globalSelectedBookIds: [],
  settings: {
    depth: 2,
    budgetPercent: 25,
    budgetCap: 0,
    recursive: false,
    includeNames: true,
    caseSensitive: false,
    matchWholeWords: false,
    minActivations: 0,
    minActivationsDepthMax: 0,
    maxRecursionSteps: 0,
  },
});

