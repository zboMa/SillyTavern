import type { ChatCapability } from './chat';
import type { CharactersCapability } from './characters';

export type ChatBackupsCapability = {
  exportBackup: () => object;
  importBackup: (data: unknown) => void;
};

export function createChatBackups(chat: ChatCapability, characters: CharactersCapability): ChatBackupsCapability {
  function exportBackup() {
    return {
      version: 1,
      exportedAt: Date.now(),
      chat: chat.exportJson(),
      characters: characters.exportJson(),
    };
  }

  function importBackup(data: unknown) {
    const d = data as any;
    if (!d || d.version !== 1) throw new Error('Unsupported backup format');
    chat.importJson(d.chat);
    characters.importJson(d.characters);
  }

  return { exportBackup, importBackup };
}

