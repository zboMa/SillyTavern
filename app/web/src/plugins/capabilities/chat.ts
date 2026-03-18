import type { ChatMessage, ChatSession } from '../../core/chat/model';
import type { KeyValueStorage } from './storage';
import type { EventBus } from '../../core/events/EventBus';

export type ChatCapability = {
  listSessions: () => ChatSession[];
  getActiveSession: () => ChatSession | null;
  setActiveSession: (id: string) => void;
  createSession: (title?: string) => ChatSession;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  clearSession: (id: string) => void;
  duplicateSession: (id: string) => ChatSession | null;

  appendMessage: (sessionId: string, message: ChatSession['messages'][number]) => void;
  appendUserMessage: (sessionId: string, content: string) => string;
  startAssistantMessage: (sessionId: string) => string;
  appendAssistantDelta: (sessionId: string, messageId: string, delta: string, choiceIndex?: number) => void;
  finishAssistantMessage: (
    sessionId: string,
    messageId: string,
    result: { ok: boolean; error?: string; aborted?: boolean; reasoning?: string; toolCalls?: unknown[] },
  ) => void;

  editMessage: (sessionId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  deleteMessage: (sessionId: string, messageId: string) => void;
  swipePrev: (sessionId: string, messageId: string) => void;
  swipeNext: (sessionId: string, messageId: string) => void;
  selectSwipe: (sessionId: string, messageId: string, index: number) => void;
  exportJson: () => object;
  importJson: (data: unknown) => void;
};

type PersistedChatV1 = {
  version: 1;
  activeId: string | null;
  sessions: ChatSession[];
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function createInMemoryChat(events?: EventBus): ChatCapability {
  const sessions: ChatSession[] = [];
  let activeId: string | null = null;

  const now = () => Date.now();
  const uuid = () => crypto.randomUUID();
  const emit = (payload: Record<string, unknown> = {}) => events?.emit('chat.changed', { activeId, ...payload });

  function getSession(id: string) {
    return sessions.find((s) => s.id === id) ?? null;
  }

  function touchSession(s: ChatSession) {
    s.updatedAt = now();
  }

  function createSession(title = 'New chat'): ChatSession {
    const t = now();
    const session: ChatSession = {
      id: uuid(),
      title,
      createdAt: t,
      updatedAt: t,
      messages: [],
    };
    sessions.unshift(session);
    activeId = session.id;
    emit({ type: 'session.created', sessionId: session.id });
    return session;
  }

  function listSessions() {
    return sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function getActiveSession() {
    return activeId ? sessions.find((s) => s.id === activeId) ?? null : null;
  }

  function setActiveSession(id: string) {
    if (sessions.some((s) => s.id === id)) {
      activeId = id;
      emit({ type: 'session.active', sessionId: id });
    }
  }

  function renameSession(id: string, title: string) {
    const s = getSession(id);
    if (!s) return;
    s.title = title;
    touchSession(s);
    emit({ type: 'session.renamed', sessionId: id });
  }

  function deleteSession(id: string) {
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx < 0) return;
    sessions.splice(idx, 1);
    if (activeId === id) activeId = sessions[0]?.id ?? null;
    emit({ type: 'session.deleted', sessionId: id });
  }

  function clearSession(id: string) {
    const s = getSession(id);
    if (!s) return;
    s.messages = [];
    touchSession(s);
    emit({ type: 'session.cleared', sessionId: id });
  }

  function duplicateSession(id: string) {
    const src = getSession(id);
    if (!src) return null;
    const t = now();
    const copy: ChatSession = {
      id: uuid(),
      title: `${src.title} (copy)`,
      createdAt: t,
      updatedAt: t,
      messages: src.messages.map((m) => ({ ...m, id: uuid() })),
      meta: src.meta ? { ...src.meta } : undefined,
    };
    sessions.unshift(copy);
    activeId = copy.id;
    emit({ type: 'session.duplicated', sessionId: copy.id });
    return copy;
  }

  function appendMessage(sessionId: string, message: ChatSession['messages'][number]) {
    const s = getSession(sessionId);
    if (!s) return;
    s.messages.push(message);
    touchSession(s);
    emit({ type: 'message.appended', sessionId, messageId: (message as any)?.id });
  }

  function appendUserMessage(sessionId: string, content: string) {
    const id = uuid();
    appendMessage(sessionId, { id, role: 'user', content, createdAt: now() } as any);
    return id;
  }

  function startAssistantMessage(sessionId: string) {
    const id = uuid();
    appendMessage(sessionId, { id, role: 'assistant', content: '', createdAt: now(), status: 'streaming' } as any);
    return id;
  }

  function appendAssistantDelta(sessionId: string, messageId: string, delta: string, choiceIndex = 0) {
    const s = getSession(sessionId);
    if (!s) return;
    const m = s.messages.find((x) => x.id === messageId);
    if (!m) return;
    if (choiceIndex > 0) {
      const swipeIndex = choiceIndex - 1;
      m.swipes = m.swipes ?? [];
      m.swipes[swipeIndex] = (m.swipes[swipeIndex] ?? '') + delta;
      if (m.selectedSwipeIndex == null) m.selectedSwipeIndex = 0;
    } else {
      m.content = (m.content ?? '') + delta;
    }
    m.updatedAt = now();
    touchSession(s);
    emit({ type: 'message.delta', sessionId, messageId, choiceIndex });
  }

  function finishAssistantMessage(
    sessionId: string,
    messageId: string,
    result: { ok: boolean; error?: string; aborted?: boolean; reasoning?: string; toolCalls?: unknown[] },
  ) {
    const s = getSession(sessionId);
    if (!s) return;
    const m = s.messages.find((x) => x.id === messageId);
    if (!m) return;
    m.status = result.aborted ? 'aborted' : result.ok ? 'ok' : 'error';
    if (typeof result.reasoning === 'string') m.reasoning = result.reasoning;
    if (Array.isArray(result.toolCalls)) m.toolCalls = result.toolCalls as any;
    m.meta = { ...(m.meta ?? {}), error: result.error ?? null };
    m.updatedAt = now();
    touchSession(s);
    emit({ type: 'message.finished', sessionId, messageId });
  }

  function editMessage(sessionId: string, messageId: string, patch: Partial<ChatMessage>) {
    const s = getSession(sessionId);
    if (!s) return;
    const idx = s.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    s.messages[idx] = { ...s.messages[idx], ...patch, updatedAt: now() };
    touchSession(s);
    emit({ type: 'message.edited', sessionId, messageId });
  }

  function deleteMessage(sessionId: string, messageId: string) {
    const s = getSession(sessionId);
    if (!s) return;
    const idx = s.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    s.messages.splice(idx, 1);
    touchSession(s);
    emit({ type: 'message.deleted', sessionId, messageId });
  }

  function selectSwipe(sessionId: string, messageId: string, index: number) {
    const s = getSession(sessionId);
    if (!s) return;
    const m = s.messages.find((x) => x.id === messageId);
    if (!m || !Array.isArray(m.swipes)) return;
    const max = m.swipes.length;
    const next = Math.max(0, Math.min(index, max));
    m.selectedSwipeIndex = next;
    touchSession(s);
    emit({ type: 'message.swipe', sessionId, messageId, index: next });
  }

  function swipePrev(sessionId: string, messageId: string) {
    const s = getSession(sessionId);
    if (!s) return;
    const m = s.messages.find((x) => x.id === messageId);
    if (!m) return;
    const cur = m.selectedSwipeIndex ?? 0;
    selectSwipe(sessionId, messageId, cur - 1);
  }

  function swipeNext(sessionId: string, messageId: string) {
    const s = getSession(sessionId);
    if (!s) return;
    const m = s.messages.find((x) => x.id === messageId);
    if (!m || !Array.isArray(m.swipes)) return;
    const cur = m.selectedSwipeIndex ?? 0;
    selectSwipe(sessionId, messageId, cur + 1);
  }

  function exportJson(): PersistedChatV1 {
    return {
      version: 1,
      activeId,
      sessions: sessions.slice(),
    };
  }

  function importJson(data: unknown) {
    const d = data as Partial<PersistedChatV1>;
    if (!d || d.version !== 1 || !Array.isArray(d.sessions)) {
      throw new Error('Invalid chat export format');
    }
    sessions.splice(0, sessions.length, ...d.sessions);
    activeId = typeof d.activeId === 'string' || d.activeId === null ? d.activeId : null;
    if (activeId && !sessions.some((s) => s.id === activeId)) {
      activeId = sessions[0]?.id ?? null;
    }
  }

  // seed
  const seed = createSession('Welcome');
  appendMessage(seed.id, { id: uuid(), role: 'system', content: 'Chat capability (in-memory) seeded.', createdAt: now() });

  return {
    listSessions,
    getActiveSession,
    setActiveSession,
    createSession,
    renameSession,
    deleteSession,
    clearSession,
    duplicateSession,
    appendMessage,
    appendUserMessage,
    startAssistantMessage,
    appendAssistantDelta,
    finishAssistantMessage,
    editMessage,
    deleteMessage,
    swipePrev,
    swipeNext,
    selectSwipe,
    exportJson,
    importJson,
  };
}

export function createPersistedChat(storage: KeyValueStorage, key = 'chat.v1', events?: EventBus): ChatCapability {
  const base = createInMemoryChat(events);

  const persisted = safeParse<PersistedChatV1>(storage.getString(key));
  if (persisted?.version === 1) {
    try {
      base.importJson(persisted);
    } catch {
      // ignore bad data
    }
  }

  const save = () => {
    storage.setString(key, JSON.stringify(base.exportJson()));
  };

  return {
    ...base,
    setActiveSession(id) {
      base.setActiveSession(id);
      save();
    },
    createSession(title) {
      const s = base.createSession(title);
      save();
      return s;
    },
    renameSession(id, title) {
      base.renameSession(id, title);
      save();
    },
    deleteSession(id) {
      base.deleteSession(id);
      save();
    },
    clearSession(id) {
      base.clearSession(id);
      save();
    },
    duplicateSession(id) {
      const s = base.duplicateSession(id);
      save();
      return s;
    },
    appendMessage(sessionId, message) {
      base.appendMessage(sessionId, message);
      save();
    },
    appendUserMessage(sessionId, content) {
      const id = base.appendUserMessage(sessionId, content);
      save();
      return id;
    },
    startAssistantMessage(sessionId) {
      const id = base.startAssistantMessage(sessionId);
      save();
      return id;
    },
    appendAssistantDelta(sessionId, messageId, delta, choiceIndex) {
      base.appendAssistantDelta(sessionId, messageId, delta, choiceIndex);
      save();
    },
    finishAssistantMessage(sessionId, messageId, result) {
      base.finishAssistantMessage(sessionId, messageId, result);
      save();
    },
    editMessage(sessionId, messageId, patch) {
      base.editMessage(sessionId, messageId, patch);
      save();
    },
    deleteMessage(sessionId, messageId) {
      base.deleteMessage(sessionId, messageId);
      save();
    },
    swipePrev(sessionId, messageId) {
      base.swipePrev(sessionId, messageId);
      save();
    },
    swipeNext(sessionId, messageId) {
      base.swipeNext(sessionId, messageId);
      save();
    },
    selectSwipe(sessionId, messageId, index) {
      base.selectSwipe(sessionId, messageId, index);
      save();
    },
    importJson(data) {
      base.importJson(data);
      save();
    },
  };
}

