export type CommandHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

export type CommandDefinition = {
  id: string;
  title: string;
  description?: string;
  handler: CommandHandler;
};

export class CommandRegistry {
  private commands = new Map<string, CommandDefinition>();

  register(def: CommandDefinition): void {
    if (!def?.id) throw new Error('Command requires id');
    if (this.commands.has(def.id)) throw new Error(`Command already registered: ${def.id}`);
    this.commands.set(def.id, def);
  }

  list(): CommandDefinition[] {
    return [...this.commands.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  async execute(id: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const cmd = this.commands.get(id);
    if (!cmd) throw new Error(`Unknown command: ${id}`);
    return await cmd.handler(args);
  }
}

