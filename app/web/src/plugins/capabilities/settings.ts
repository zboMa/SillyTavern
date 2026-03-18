export type SettingsScope = 'app' | 'user';

export type SettingsSchema = {
  id: string;
  title: string;
  scope: SettingsScope;
  /**
   * JSON-schema-like object for future validation/UI generation.
   * Kept loose on purpose for early iteration.
   */
  schema: Record<string, unknown>;
  defaultValue: unknown;
};

export class SettingsRegistry {
  private schemas = new Map<string, SettingsSchema>();
  private values = new Map<string, unknown>();

  register(schema: SettingsSchema): void {
    if (!schema?.id) throw new Error('Settings schema requires id');
    if (this.schemas.has(schema.id)) throw new Error(`Settings schema already registered: ${schema.id}`);
    this.schemas.set(schema.id, schema);
    if (!this.values.has(schema.id)) {
      this.values.set(schema.id, schema.defaultValue);
    }
  }

  list(): SettingsSchema[] {
    return [...this.schemas.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  get<T = unknown>(id: string): T {
    if (!this.values.has(id)) {
      const schema = this.schemas.get(id);
      if (!schema) throw new Error(`Unknown settings id: ${id}`);
      this.values.set(id, schema.defaultValue);
    }
    return this.values.get(id) as T;
  }

  set<T = unknown>(id: string, value: T): void {
    if (!this.schemas.has(id)) throw new Error(`Unknown settings id: ${id}`);
    this.values.set(id, value);
  }
}

