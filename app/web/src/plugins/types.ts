import type { Component } from 'vue';

export type PluginId = string;

export type PluginSlotName = 'topbar' | 'main' | 'right';

export type PluginCapabilityName =
  | 'events'
  | 'commands'
  | 'settings'
  | 'storage'
  | 'api'
  | 'chat'
  | 'characters'
  | 'tags'
  | 'bindings'
  | 'generation'
  | 'connections'
  | 'tokens'
  | 'worldinfo'
  | 'groups'
  | 'chatBackups'
  | 'chatFiles'
  | 'presets'
  | 'slash'
  | 'macros'
  | 'promptPipeline'
  | 'regex'
  | 'quickReply';

export type PluginUiContribution = {
  id: string;
  title: string;
  slot: PluginSlotName;
  component: Component;
  /**
   * Higher loads earlier. For navigation lists, also controls ordering.
   */
  order?: number;
};

export type PluginContext = {
  /**
   * Simple logging utility; can later be replaced by a structured logger.
   */
  log: (namespace: string, ...args: unknown[]) => void;

  /**
   * Access to core capabilities (registered by the app).
   * Plugins should prefer capabilities over importing other features directly.
   */
  cap: <T = unknown>(name: PluginCapabilityName) => T;
};

export type PluginModule = {
  id: PluginId;
  displayName: string;
  version: string;

  /**
   * Hard plugin dependencies (by plugin id).
   */
  requires?: PluginId[];

  /**
   * Called once during registration.
   */
  setup?: (ctx: PluginContext) => void;

  /**
   * Called when the app starts plugins (after all registrations).
   * Use this to wire runtime hooks.
   */
  start?: (ctx: PluginContext) => void;

  /**
   * UI contributions. Prefer small, focused panels.
   */
  ui?: PluginUiContribution[];
};

