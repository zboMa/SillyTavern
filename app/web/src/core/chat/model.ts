export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessageStatus = 'streaming' | 'ok' | 'error' | 'aborted';

export type ChatToolCall = {
  id: string;
  type: string;
  payload: unknown;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number; // epoch ms
  updatedAt?: number; // epoch ms
  status?: ChatMessageStatus;

  // Swipe/variants (assistant only)
  swipes?: string[];
  selectedSwipeIndex?: number;

  // Optional advanced fields
  reasoning?: string;
  toolCalls?: ChatToolCall[];
  attachments?: { id: string; name: string; kind: string; data?: unknown }[];
  meta?: Record<string, unknown>;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  meta?: Record<string, unknown>;
};

