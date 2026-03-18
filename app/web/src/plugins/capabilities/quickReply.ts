import type { KeyValueStorage } from './storage';
import type { EventBus } from '../../core/events/EventBus';

export type QuickReplyButton = {
  id: string;
  label: string;
  text: string;
  commandId?: string | null;
  when?: {
    startsWith?: string;
  };
  enabled: boolean;
  order: number;
};

type PersistedQuickReplyV1 = {
  version: 1;
  buttons: QuickReplyButton[];
};

export type QuickReplyCapability = {
  listButtons: () => QuickReplyButton[];
  listAllButtons: () => QuickReplyButton[];
  upsertButton: (b: QuickReplyButton) => void;
  removeButton: (id: string) => void;
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function createPersistedQuickReply(storage: KeyValueStorage, events?: EventBus, key = 'quickReply.v1'): QuickReplyCapability {
  const buttons: QuickReplyButton[] = [];
  const emit = () => events?.emit('quickReply.changed', {});

  function save() {
    const payload: PersistedQuickReplyV1 = { version: 1, buttons: buttons.slice() };
    storage.setString(key, JSON.stringify(payload));
    emit();
  }

  function load() {
    const persisted = safeParse<PersistedQuickReplyV1>(storage.getString(key));
    if (persisted?.version === 1 && Array.isArray(persisted.buttons)) {
      buttons.splice(0, buttons.length, ...persisted.buttons);
    }
  }

  function listButtons() {
    return buttons.slice().filter((b) => b.enabled).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label));
  }
  function listAllButtons() {
    return buttons.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label));
  }

  function upsertButton(b: QuickReplyButton) {
    const idx = buttons.findIndex((x) => x.id === b.id);
    if (idx >= 0) buttons[idx] = b;
    else buttons.push(b);
    save();
  }

  function removeButton(id: string) {
    const idx = buttons.findIndex((x) => x.id === id);
    if (idx >= 0) buttons.splice(idx, 1);
    save();
  }

  load();
  if (!buttons.length) {
    upsertButton({ id: crypto.randomUUID(), label: 'Hello', text: 'Hello!', enabled: true, order: 10 });
    upsertButton({ id: crypto.randomUUID(), label: 'Continue', text: 'Continue.', enabled: true, order: 20 });
  }

  return { listButtons, listAllButtons, upsertButton, removeButton };
}

