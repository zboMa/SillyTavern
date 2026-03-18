<script setup lang="ts">
import { createPluginManager } from "./plugins/manager";
import { registerBuiltins } from "./plugins/registerBuiltins";
import PluginSlot from "./plugins/ui/PluginSlot.vue";
import { EventBus } from "./core/events/EventBus";
import { CommandRegistry } from "./plugins/capabilities/commands";
import { SettingsRegistry } from "./plugins/capabilities/settings";
import { BrowserStorage } from "./plugins/capabilities/storage";
import { createApiClient } from "./core/http/ApiClient";
import { createPersistedChat } from "./plugins/capabilities/chat";
import { createPersistedCharacters } from "./plugins/capabilities/characters";
import { createPersistedTags } from "./plugins/capabilities/tags";
import { createCharacterChatBinding } from "./plugins/capabilities/bindings";
import { createGeneration } from "./plugins/capabilities/generation";
import { createPersistedConnections } from "./plugins/capabilities/connections";
import { createTokens } from "./plugins/capabilities/tokens";
import { createPersistedWorldInfo } from "./plugins/capabilities/worldinfo";
import { createPersistedGroups } from "./plugins/capabilities/groups";
import { createChatBackups } from "./plugins/capabilities/chatBackups";
import { createSlash } from "./plugins/capabilities/slash";
import { createMacros } from "./plugins/capabilities/macros";
import { createPromptPipeline } from "./plugins/capabilities/promptPipeline";
import { createPersistedRegex } from "./plugins/capabilities/regex";
import { createPersistedQuickReply } from "./plugins/capabilities/quickReply";
import { createChatFiles } from "./plugins/capabilities/chatFiles";
import { createPersistedPresets } from "./plugins/capabilities/presets";

const pluginManager = createPluginManager();

// Core capabilities provided by the app (not by plugins)
const events = new EventBus();
pluginManager.provide("events", events);
pluginManager.provide("commands", new CommandRegistry());
pluginManager.provide("settings", new SettingsRegistry());
const storage = new BrowserStorage("local");
pluginManager.provide("storage", storage);
const api = createApiClient("");
pluginManager.provide("api", api);
pluginManager.provide("chat", createPersistedChat(storage, "chat.v1", events));
pluginManager.provide("characters", createPersistedCharacters(storage));
pluginManager.provide("tags", createPersistedTags(storage));
const connections = createPersistedConnections(storage, events);
pluginManager.provide("connections", connections);
pluginManager.provide("tokens", createTokens(api, connections));
pluginManager.provide("worldinfo", createPersistedWorldInfo(storage, events));
pluginManager.provide("groups", createPersistedGroups(storage, events));
pluginManager.provide(
  "chatBackups",
  createChatBackups(
    pluginManager.context().cap("chat"),
    pluginManager.context().cap("characters"),
  ),
);
pluginManager.provide(
  "slash",
  createSlash(pluginManager.context().cap("commands")),
);
const macros = createMacros();
pluginManager.provide("macros", macros);
const regex = createPersistedRegex(storage, events, "regex.v1", pluginManager.context().cap("characters"));
pluginManager.provide("regex", regex);
const presets = createPersistedPresets(storage, events);
pluginManager.provide("presets" as any, presets);
pluginManager.provide(
  "promptPipeline",
  createPromptPipeline(
    pluginManager.context().cap("worldinfo"),
    pluginManager.context().cap("characters"),
    macros,
    regex,
    presets,
  ),
);
pluginManager.provide("quickReply", createPersistedQuickReply(storage, events));
pluginManager.provide("chatFiles" as any, createChatFiles(api));
pluginManager.provide(
  "bindings",
  createCharacterChatBinding(
    pluginManager.context().cap("chat"),
    pluginManager.context().cap("characters"),
  ),
);
pluginManager.provide(
  "generation",
  createGeneration(
    api,
    pluginManager.context().cap("chat"),
    connections,
    pluginManager.context().cap("worldinfo"),
    pluginManager.context().cap("characters"),
    pluginManager.context().cap("promptPipeline"),
    presets,
  ),
);

registerBuiltins(pluginManager);
pluginManager.start();

const pluginCtx = pluginManager.context();

const topbarItems = pluginManager.getSlot("topbar");
const mainItems = pluginManager.getSlot("main");
const rightItems = pluginManager.getSlot("right");
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="brand">SillyTavern</div>
      <div class="muted">Vue 3 rewrite (plugin-first)</div>
      <div class="topbar__right">
        <PluginSlot :items="topbarItems" :ctx="pluginCtx" />
      </div>
    </header>

    <main class="layout">
      <section class="stage">
        <div class="stage__header">
          <h2 class="stage__title">Main</h2>
        </div>
        <PluginSlot :items="mainItems" :ctx="pluginCtx" />
      </section>

      <aside class="right">
        <div class="right__header">
          <h3 class="right__title">Right panel</h3>
        </div>
        <PluginSlot :items="rightItems" :ctx="pluginCtx" />
      </aside>
    </main>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  background: #111;
  color: #f5f5f5;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    Segoe UI,
    Roboto,
    Helvetica,
    Arial,
    sans-serif;
}
.topbar {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #222;
}
.brand {
  font-weight: 700;
  letter-spacing: 0.3px;
}
.muted {
  color: #a3a3a3;
}
.topbar__right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.layout {
  display: grid;
  grid-template-columns: 1fr 420px;
  gap: 16px;
  padding: 16px 20px;
}
.stage {
  border: 1px solid #222;
  border-radius: 12px;
  padding: 16px;
  background: #0b0b0b;
}
.stage__header,
.right__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.stage__title,
.right__title {
  margin: 0;
  font-size: 16px;
}
.right {
  border: 1px solid #222;
  border-radius: 12px;
  padding: 16px;
  background: #0b0b0b;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
