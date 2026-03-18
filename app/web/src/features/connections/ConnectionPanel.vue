<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PluginContext } from '../../plugins/types';
import type { ConnectionsCapability, ConnectionProfile } from '../../plugins/capabilities/connections';
import type { ApiClient } from '../../core/http/ApiClient';

const props = defineProps<{ ctx: PluginContext }>();
const connections = props.ctx.cap<ConnectionsCapability>('connections');
const api = props.ctx.cap<ApiClient>('api');

const profiles = computed(() => connections.list());
const active = computed(() => connections.getActive());

const draft = ref<ConnectionProfile | null>(active.value ? { ...active.value } : null);

function select(id: string) {
  connections.setActive(id);
  const a = connections.getActive();
  draft.value = a ? { ...a } : null;
}

function save() {
  if (!draft.value) return;
  connections.upsert({ ...draft.value });
}

function createNew() {
  const p: ConnectionProfile = {
    id: crypto.randomUUID(),
    name: 'New profile',
    chatCompletionSource: 'openai',
    model: 'gpt-3.5-turbo',
    maxContextTokens: 8192,
    reverseProxy: null,
    proxyPassword: null,
  };
  connections.upsert(p);
  select(p.id);
}

function remove() {
  if (!draft.value) return;
  connections.remove(draft.value.id);
  const a = connections.getActive();
  draft.value = a ? { ...a } : null;
}

const pingState = ref<'idle' | 'ok' | 'fail'>('idle');
const pingError = ref('');
async function ping() {
  pingState.value = 'idle';
  pingError.value = '';
  try {
    await api.postJson('/api/ping', {});
    pingState.value = 'ok';
  } catch (e: any) {
    pingState.value = 'fail';
    pingError.value = String(e?.message ?? e);
  }
}
</script>

<template>
  <section class="panel">
    <header class="panel__header">
      <h3 class="panel__title">Connection</h3>
      <button class="btn" type="button" @click="createNew">New</button>
    </header>

    <div class="grid">
      <aside class="sidebar">
        <button v-for="p in profiles" :key="p.id" class="item" :class="{ 'item--active': p.id === active?.id }" type="button" @click="select(p.id)">
          <div class="name">{{ p.name }}</div>
          <div class="meta">{{ p.chatCompletionSource }} · {{ p.model }}</div>
        </button>
      </aside>

      <main class="editor">
        <div v-if="!draft" class="muted">No profile</div>
        <template v-else>
          <label class="field">
            <div class="label">Name</div>
            <input v-model="draft.name" class="input" type="text" @blur="save" />
          </label>

          <label class="field">
            <div class="label">Chat completion source</div>
            <input v-model="draft.chatCompletionSource" class="input" type="text" placeholder="openai/openrouter/..." @blur="save" />
          </label>

          <label class="field">
            <div class="label">Model</div>
            <input v-model="draft.model" class="input" type="text" placeholder="gpt-..." @blur="save" />
          </label>

          <label class="field">
            <div class="label">Context size (tokens)</div>
            <input v-model.number="draft.maxContextTokens" class="input" type="number" min="1" step="1" @blur="save" />
          </label>

          <label class="field">
            <div class="label">Reverse proxy (optional)</div>
            <input v-model="draft.reverseProxy" class="input" type="text" placeholder="https://..." @blur="save" />
          </label>

          <label class="field">
            <div class="label">Proxy password (optional)</div>
            <input v-model="draft.proxyPassword" class="input" type="password" @blur="save" />
          </label>

          <div class="row">
            <button class="btn" type="button" @click="save">Save</button>
            <button class="btn" type="button" @click="ping">Ping</button>
            <button class="btn btn--danger" type="button" @click="remove">Delete</button>
          </div>
          <div v-if="pingState !== 'idle'" class="muted">
            Ping: <span class="mono">{{ pingState }}</span>
            <span v-if="pingError" class="mono">— {{ pingError }}</span>
          </div>
        </template>
      </main>
    </div>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid #222;
  border-radius: 12px;
  padding: 12px;
  background: #0b0b0b;
}
.panel__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.panel__title {
  margin: 0;
  font-size: 14px;
}
.btn {
  margin-left: auto;
  background: #161616;
  color: #f5f5f5;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 6px 10px;
  cursor: pointer;
}
.btn--danger {
  border-color: #512020;
  background: #241111;
}
.grid {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 10px;
}
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item {
  text-align: left;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #222;
  background: #101010;
  color: #f5f5f5;
  cursor: pointer;
}
.item--active {
  border-color: #3a3a3a;
  background: #151515;
}
.name {
  font-weight: 700;
}
.meta {
  color: #a3a3a3;
  font-size: 12px;
}
.editor {
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.field .label {
  font-size: 12px;
  color: #c7c7c7;
  margin-bottom: 6px;
}
.input {
  width: 100%;
  background: #121212;
  color: #f5f5f5;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 8px 10px;
}
.row {
  display: flex;
  gap: 8px;
}
.muted {
  color: #a3a3a3;
}
</style>

