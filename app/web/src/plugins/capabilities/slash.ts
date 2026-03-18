import type { CommandRegistry } from './commands';

export type SlashResult =
  | { type: 'text'; text: string }
  | { type: 'handled'; ok: boolean; result?: unknown; error?: string };

export type SlashCapability = {
  tryHandle: (input: string) => Promise<SlashResult | null>;
  suggest: (input: string) => { id: string; title: string }[];
};

export function createSlash(commands: CommandRegistry): SlashCapability {
  async function tryHandle(input: string): Promise<SlashResult | null> {
    const raw = input.trim();
    if (!raw.startsWith('/')) return null;
    const parts = raw.slice(1).split(/\s+/);
    const id = parts[0];
    if (!id) return null;
    try {
      const result = await commands.execute(id, {});
      return { type: 'handled', ok: true, result };
    } catch (e: any) {
      return { type: 'handled', ok: false, error: String(e?.message ?? e) };
    }
  }

  function suggest(input: string) {
    const raw = input.trim();
    if (!raw.startsWith('/')) return [];
    const q = raw.slice(1).toLowerCase();
    return commands
      .list()
      .filter((c) => c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
      .slice(0, 8)
      .map((c) => ({ id: c.id, title: c.title }));
  }

  return { tryHandle, suggest };
}

