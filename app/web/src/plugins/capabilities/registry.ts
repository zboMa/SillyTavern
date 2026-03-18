import type { PluginCapabilityName } from '../types';

export class CapabilityRegistry {
  private caps = new Map<PluginCapabilityName, unknown>();

  set<T>(name: PluginCapabilityName, impl: T): void {
    this.caps.set(name, impl);
  }

  get<T>(name: PluginCapabilityName): T {
    if (!this.caps.has(name)) {
      throw new Error(`Capability not registered: ${name}`);
    }
    return this.caps.get(name) as T;
  }

  has(name: PluginCapabilityName): boolean {
    return this.caps.has(name);
  }
}

