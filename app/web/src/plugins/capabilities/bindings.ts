import type { ChatCapability } from './chat';
import type { CharactersCapability } from './characters';
import type { CharacterCard } from '../../core/characters/model';

export type CharacterChatBindingCapability = {
  ensureActiveChatForActiveCharacter: () => { character: CharacterCard | null; chatSessionId: string | null };
  bindCharacterToChat: (characterId: string, chatSessionId: string) => void;
};

export function createCharacterChatBinding(chat: ChatCapability, characters: CharactersCapability): CharacterChatBindingCapability {
  function bindCharacterToChat(characterId: string, chatSessionId: string) {
    const c = characters.getById(characterId);
    if (!c) return;
    characters.upsert({ ...c, activeChatSessionId: chatSessionId });
    chat.setActiveSession(chatSessionId);
  }

  function ensureActiveChatForActiveCharacter() {
    const c = characters.getActive();
    if (!c) return { character: null, chatSessionId: null };

    const desired = c.activeChatSessionId ?? null;
    if (desired && chat.listSessions().some((s) => s.id === desired)) {
      chat.setActiveSession(desired);
      return { character: c, chatSessionId: desired };
    }

    const s = chat.createSession(`${c.name || 'Character'} chat`);
    characters.upsert({ ...c, activeChatSessionId: s.id });
    return { character: characters.getById(c.id), chatSessionId: s.id };
  }

  return { ensureActiveChatForActiveCharacter, bindCharacterToChat };
}

