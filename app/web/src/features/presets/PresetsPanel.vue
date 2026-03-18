<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { PluginContext } from '../../plugins/types';
import type { PresetsCapability, ChatCompletionPreset } from '../../plugins/capabilities/presets';
import type { ConnectionsCapability } from '../../plugins/capabilities/connections';
import type { EventBus } from '../../core/events/EventBus';

const props = defineProps<{ ctx: PluginContext }>();
const presets = props.ctx.cap<PresetsCapability>('presets' as any);
const connections = props.ctx.cap<ConnectionsCapability>('connections');
const events = props.ctx.cap<EventBus>('events');

const tick = ref(0);
let unsub: null | (() => void) = null;
onMounted(() => {
  unsub = events.on('presets.changed', () => tick.value++);
});
onBeforeUnmount(() => unsub?.());

const apiId = computed(() => (tick.value, connections.getActive()?.chatCompletionSource ?? 'openai'));
const items = computed(() => presets.list(apiId.value));
const active = computed(() => presets.getActive(apiId.value));
const master = computed(() => (tick.value, presets.getMaster?.() ?? {}));

const selectedId = ref<string | null>(null);
selectedId.value = active.value?.id ?? null;
const selected = computed(() => items.value.find((p) => p.id === selectedId.value) ?? null);

function select(id: string) {
  selectedId.value = id;
  presets.setActive(apiId.value, id);
}

function createNew() {
  const p: ChatCompletionPreset = { id: crypto.randomUUID(), name: 'New preset', temperature: 0.7, top_p: 1, max_tokens: 512, presence_penalty: 0, frequency_penalty: 0 };
  presets.upsert(apiId.value, p);
  presets.setActive(apiId.value, p.id);
  selectedId.value = p.id;
}

function duplicate(p: ChatCompletionPreset) {
  const copy: ChatCompletionPreset = { ...p, id: crypto.randomUUID(), name: `${p.name} (copy)` };
  presets.upsert(apiId.value, copy);
  presets.setActive(apiId.value, copy.id);
  selectedId.value = copy.id;
}

function remove(p: ChatCompletionPreset) {
  presets.remove(apiId.value, p.id);
  selectedId.value = presets.getActive(apiId.value)?.id ?? null;
}

function update(patch: Partial<ChatCompletionPreset>) {
  const p = selected.value;
  if (!p) return;
  presets.upsert(apiId.value, { ...p, ...patch });
}

function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAll() {
  downloadJson(presets.exportJson(), `st-presets-${new Date().toISOString()}.json`);
}

const importRef = ref<HTMLInputElement | null>(null);
function importClick() {
  importRef.value?.click();
}

async function onImport(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    presets.importJson(parsed);
  } catch {
    // ignore for now
  } finally {
    input.value = '';
  }
}

function updateMaster(section: string, patch: any) {
  const cur = (master.value as any)?.[section] ?? {};
  presets.setMaster(section as any, { ...cur, ...patch });
}
</script>

<template>
  <section class="panel">
    <header class="panel__header">
      <h2 class="panel__title">Presets</h2>
      <div class="muted">API: <span class="mono">{{ apiId }}</span></div>
      <div class="actions">
        <input ref="importRef" class="hidden" type="file" accept="application/json,.json" @change="onImport" />
        <button class="btn" type="button" @click="importClick">Import</button>
        <button class="btn" type="button" @click="exportAll">Export</button>
        <button class="btn" type="button" @click="createNew">New</button>
      </div>
    </header>

    <div class="grid">
      <aside class="sidebar">
        <button
          v-for="p in items"
          :key="p.id"
          class="item"
          :class="{ 'item--active': p.id === active?.id }"
          type="button"
          @click="select(p.id)"
        >
          <div class="item__row">
            <div class="item__name">{{ p.name }}</div>
            <div class="muted mono" v-if="p.id === active?.id">active</div>
          </div>
          <div class="item__meta muted">
            temp={{ p.temperature ?? '—' }}, top_p={{ p.top_p ?? '—' }}, max={{ p.max_tokens ?? '—' }}
          </div>
        </button>
      </aside>

      <main class="editor">
        <div v-if="!selected" class="muted">No preset selected</div>
        <template v-else>
          <div class="editor__header">
            <input class="input" :value="selected.name" @input="update({ name: ($event.target as HTMLInputElement).value })" />
            <button class="btn" type="button" @click="duplicate(selected)">Duplicate</button>
            <button class="btn btn--danger" type="button" @click="remove(selected)">Delete</button>
          </div>

          <div class="form">
            <label class="field">
              <div class="field__label">Temperature</div>
              <input class="input" type="number" step="0.01" :value="selected.temperature ?? 0.7" @input="update({ temperature: Number(($event.target as HTMLInputElement).value) })" />
            </label>
            <label class="field">
              <div class="field__label">Top-p</div>
              <input class="input" type="number" step="0.01" :value="selected.top_p ?? 1" @input="update({ top_p: Number(($event.target as HTMLInputElement).value) })" />
            </label>
            <label class="field">
              <div class="field__label">Max tokens</div>
              <input class="input" type="number" step="1" :value="selected.max_tokens ?? 512" @input="update({ max_tokens: Number(($event.target as HTMLInputElement).value) })" />
            </label>
            <label class="field">
              <div class="field__label">Presence penalty</div>
              <input
                class="input"
                type="number"
                step="0.1"
                :value="(selected as any).presence_penalty ?? 0"
                @input="update({ presence_penalty: Number(($event.target as HTMLInputElement).value) } as any)"
              />
            </label>
            <label class="field">
              <div class="field__label">Frequency penalty</div>
              <input
                class="input"
                type="number"
                step="0.1"
                :value="(selected as any).frequency_penalty ?? 0"
                @input="update({ frequency_penalty: Number(($event.target as HTMLInputElement).value) } as any)"
              />
            </label>
            <label class="field">
              <div class="field__label">Seed</div>
              <input
                class="input"
                type="number"
                step="1"
                :value="(selected as any).seed ?? ''"
                placeholder="(optional)"
                @input="update({ seed: (($event.target as HTMLInputElement).value === '' ? undefined : Number(($event.target as HTMLInputElement).value)) } as any)"
              />
            </label>
            <label class="field">
              <div class="field__label">Stop sequences (one per line)</div>
              <textarea
                class="input"
                rows="3"
                :value="Array.isArray((selected as any).stop) ? (selected as any).stop.join('\n') : ''"
                @input="update({ stop: String(($event.target as HTMLTextAreaElement).value ?? '').split('\n').map((x) => x.trim()).filter(Boolean) } as any)"
              />
            </label>
          </div>

          <details class="master">
            <summary>Master sections (sysprompt / reasoning / srw)</summary>

            <div class="master__grid">
              <div class="master__col">
                <div class="master__title">System prompt</div>
                <label class="field">
                  <div class="field__label">Name</div>
                  <input class="input" :value="(master as any).sysprompt?.name ?? ''" @input="updateMaster('sysprompt', { name: ($event.target as HTMLInputElement).value })" />
                </label>
                <label class="field">
                  <div class="field__label">Content</div>
                  <textarea class="input" rows="5" :value="(master as any).sysprompt?.content ?? ''" @input="updateMaster('sysprompt', { content: ($event.target as HTMLTextAreaElement).value })" />
                </label>
              </div>

              <div class="master__col">
                <div class="master__title">Reasoning formatting</div>
                <label class="field">
                  <div class="field__label">Name</div>
                  <input class="input" :value="(master as any).reasoning?.name ?? ''" @input="updateMaster('reasoning', { name: ($event.target as HTMLInputElement).value })" />
                </label>
                <label class="field">
                  <div class="field__label">Prefix</div>
                  <input class="input" :value="(master as any).reasoning?.prefix ?? ''" @input="updateMaster('reasoning', { prefix: ($event.target as HTMLInputElement).value })" />
                </label>
                <label class="field">
                  <div class="field__label">Separator</div>
                  <input class="input" :value="(master as any).reasoning?.separator ?? ''" @input="updateMaster('reasoning', { separator: ($event.target as HTMLInputElement).value })" />
                </label>
                <label class="field">
                  <div class="field__label">Suffix</div>
                  <input class="input" :value="(master as any).reasoning?.suffix ?? ''" @input="updateMaster('reasoning', { suffix: ($event.target as HTMLInputElement).value })" />
                </label>
              </div>

              <div class="master__col">
                <div class="master__title">Start reply with</div>
                <label class="field">
                  <div class="field__label">Show</div>
                  <input type="checkbox" :checked="Boolean((master as any).srw?.show ?? false)" @change="updateMaster('srw', { show: ($event.target as HTMLInputElement).checked })" />
                </label>
                <label class="field">
                  <div class="field__label">Value</div>
                  <textarea class="input" rows="3" :value="(master as any).srw?.value ?? ''" @input="updateMaster('srw', { value: ($event.target as HTMLTextAreaElement).value })" />
                </label>
              </div>
            </div>
          </details>
        </template>
      </main>
    </div>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid #222;
  border-radius: 12px;
  padding: 16px;
  background: #0b0b0b;
}
.panel__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.panel__title {
  margin: 0;
  font-size: 18px;
}
.actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.grid {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 12px;
}
.sidebar {
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item {
  text-align: left;
  background: #101010;
  color: #f5f5f5;
  border: 1px solid #222;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
}
.item--active {
  border-color: #3a3a3a;
  background: #151515;
}
.item__row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}
.item__name {
  font-weight: 800;
}
.item__meta {
  margin-top: 6px;
  font-size: 12px;
}
.editor {
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
}
.editor__header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.form {
  display: grid;
  gap: 10px;
}
.field__label {
  font-size: 12px;
  color: #c7c7c7;
  margin-bottom: 6px;
}
.btn {
  background: #161616;
  color: #f5f5f5;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 6px 10px;
  cursor: pointer;
}
.btn--danger {
  border-color: #512020;
  background: #1a0e0e;
}
.input {
  width: 100%;
  background: #121212;
  color: #f5f5f5;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 8px 10px;
}
.master {
  margin-top: 12px;
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
  background: #101010;
}
.master__grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
.master__col {
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
  background: #0b0b0b;
}
.master__title {
  font-weight: 800;
  margin-bottom: 8px;
}
.hidden {
  display: none;
}
.muted {
  color: #a3a3a3;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
</style>

