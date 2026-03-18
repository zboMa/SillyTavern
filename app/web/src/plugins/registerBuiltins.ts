import type { PluginManager } from './manager';
import { worldInfoPlugin } from './builtins/worldinfo';
import { chatPlugin } from './builtins/chat';
import { charactersPlugin } from './builtins/characters';
import { coreCommandsPlugin } from './builtins/coreCommands';
import { connectionsPlugin } from './builtins/connections';
import { backupsPlugin } from './builtins/backups';
import { regexPlugin } from './builtins/regex';
import { quickReplyPlugin } from './builtins/quickReply';
import { presetsPlugin } from './builtins/presets';

export function registerBuiltins(manager: PluginManager) {
  manager.register(coreCommandsPlugin());
  manager.register(chatPlugin());
  manager.register(worldInfoPlugin());
  manager.register(charactersPlugin());
  manager.register(connectionsPlugin());
  manager.register(presetsPlugin());
  manager.register(backupsPlugin());
  manager.register(regexPlugin());
  manager.register(quickReplyPlugin());
}

