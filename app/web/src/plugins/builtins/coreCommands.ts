import type { PluginModule } from '../types';
import type { CommandRegistry } from '../capabilities/commands';
import type { ChatCapability } from '../capabilities/chat';
import type { CharactersCapability } from '../capabilities/characters';

function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function coreCommandsPlugin(): PluginModule {
  return {
    id: 'core.commands',
    displayName: 'Core Commands',
    version: '0.0.0',
    start(ctx) {
      const commands = ctx.cap<CommandRegistry>('commands');
      const chat = ctx.cap<ChatCapability>('chat');
      const characters = ctx.cap<CharactersCapability>('characters');

      commands.register({
        id: 'backup.export',
        title: 'Backup: Export (chat + characters)',
        handler: () => {
          const payload = {
            version: 1,
            exportedAt: Date.now(),
            chat: chat.exportJson(),
            characters: characters.exportJson(),
          };
          downloadJson(payload, `st-backup-${new Date().toISOString()}.json`);
          return true;
        },
      });

      commands.register({
        id: 'backup.import',
        title: 'Backup: Import (chat + characters)',
        handler: async (args) => {
          const text = args.text;
          if (typeof text !== 'string') {
            throw new Error('backup.import requires args.text (stringified JSON)');
          }
          const data = JSON.parse(text) as any;
          if (!data || data.version !== 1) throw new Error('Unsupported backup format');
          chat.importJson(data.chat);
          characters.importJson(data.characters);
          return true;
        },
      });
    },
  };
}

