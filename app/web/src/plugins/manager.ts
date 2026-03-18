import { CapabilityRegistry } from './capabilities/registry';
import type { PluginCapabilityName, PluginContext, PluginModule, PluginSlotName, PluginUiContribution } from './types';

export type PluginManager = {
  register: (plugin: PluginModule) => void;
  getSlot: (slot: PluginSlotName) => PluginUiContribution[];
  list: () => PluginModule[];
  /**
   * App-only: register a core capability implementation.
   */
  provide: <T>(name: PluginCapabilityName, impl: T) => void;
  /**
   * Start plugins (calls `start` after dependency checks).
   */
  start: () => void;
  /**
   * Exposes a stable plugin context instance.
   * Useful for UI components that need capability access.
   */
  context: () => PluginContext;
};

export function createPluginManager(): PluginManager {
  const plugins: PluginModule[] = [];
  const ui: PluginUiContribution[] = [];
  const caps = new CapabilityRegistry();

  const ctx: PluginContext = {
    log: (ns, ...args) => {
      // eslint-disable-next-line no-console
      console.log(`[${ns}]`, ...args);
    },
    cap: (name) => caps.get(name),
  };

  function register(plugin: PluginModule) {
    if (!plugin?.id) {
      throw new Error('Plugin must have an id');
    }
    if (plugins.some((p) => p.id === plugin.id)) {
      throw new Error(`Plugin already registered: ${plugin.id}`);
    }

    plugin.setup?.(ctx);

    plugins.push(plugin);

    if (Array.isArray(plugin.ui)) {
      for (const item of plugin.ui) {
        ui.push({
          ...item,
          order: item.order ?? 0,
        });
      }
    }
  }

  function list() {
    return [...plugins];
  }

  function provide<T>(name: PluginCapabilityName, impl: T) {
    caps.set(name, impl);
  }

  function start() {
    // dependency validation
    for (const p of plugins) {
      for (const dep of p.requires ?? []) {
        if (!plugins.some((x) => x.id === dep)) {
          throw new Error(`Plugin "${p.id}" requires missing plugin "${dep}"`);
        }
      }
    }
    for (const p of plugins) {
      p.start?.(ctx);
    }
  }

  function getSlot(slot: PluginSlotName) {
    return ui
      .filter((x) => x.slot === slot)
      .slice()
      .sort((a, b) => (b.order ?? 0) - (a.order ?? 0) || a.title.localeCompare(b.title));
  }

  return { register, getSlot, list, provide, start, context: () => ctx };
}

