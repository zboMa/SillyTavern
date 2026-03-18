<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PluginContext } from '../../plugins/types';
import type { RegexCapability, RegexPlacement, RegexRule, RegexScope } from '../../plugins/capabilities/regex';

const props = defineProps<{ ctx: PluginContext }>();
const regex = props.ctx.cap<RegexCapability>('regex');

const rules = computed(() => regex.list());
const selectedId = ref<string | null>(rules.value[0]?.id ?? null);
const selected = computed(() => rules.value.find((r) => r.id === selectedId.value) ?? null);

function select(id: string) {
  selectedId.value = id;
}

function createRule() {
  const r: RegexRule = {
    id: crypto.randomUUID(),
    name: 'New rule',
    placement: 'USER_INPUT',
    scope: 'global',
    find: '',
    replace: '',
    flags: 'g',
    enabled: true,
  };
  regex.upsert(r);
  selectedId.value = r.id;
}

function update(patch: Partial<RegexRule>) {
  if (!selected.value) return;
  regex.upsert({ ...selected.value, ...patch });
}

function remove() {
  if (!selected.value) return;
  const id = selected.value.id;
  regex.remove(id);
  selectedId.value = regex.list()[0]?.id ?? null;
}

const placements: RegexPlacement[] = ['USER_INPUT', 'WORLD_INFO', 'AI_OUTPUT', 'REASONING'];
const scopes: RegexScope[] = ['global', 'character', 'chat'];
</script>

<template>
  <section class="panel">
    <header class="panel__header">
      <h3 class="panel__title">Regex</h3>
      <button class="btn" type="button" @click="createRule">New</button>
    </header>

    <div class="grid">
      <aside class="sidebar">
        <button v-for="r in rules" :key="r.id" class="item" :class="{ 'item--active': r.id === selectedId }" type="button" @click="select(r.id)">
          <div class="name">{{ r.name }}</div>
          <div class="meta">{{ r.placement }} · {{ r.enabled ? 'on' : 'off' }}</div>
        </button>
      </aside>

      <main class="editor">
        <div v-if="!selected" class="muted">No rule</div>
        <template v-else>
          <label class="field">
            <div class="label">Enabled</div>
            <input type="checkbox" :checked="selected.enabled" @change="update({ enabled: ($event.target as HTMLInputElement).checked })" />
          </label>

          <label class="field">
            <div class="label">Name</div>
            <input class="input" :value="selected.name" @input="update({ name: ($event.target as HTMLInputElement).value })" />
          </label>

          <label class="field">
            <div class="label">Placement</div>
            <select class="input" :value="selected.placement" @change="update({ placement: ($event.target as HTMLSelectElement).value as RegexPlacement })">
              <option v-for="p in placements" :key="p" :value="p">{{ p }}</option>
            </select>
          </label>

          <label class="field">
            <div class="label">Scope</div>
            <select class="input" :value="selected.scope" @change="update({ scope: ($event.target as HTMLSelectElement).value as RegexScope })">
              <option v-for="s in scopes" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>

          <label class="field">
            <div class="label">Find (RegExp source)</div>
            <input class="input" :value="selected.find" @input="update({ find: ($event.target as HTMLInputElement).value })" />
          </label>

          <label class="field">
            <div class="label">Replace</div>
            <input class="input" :value="selected.replace" @input="update({ replace: ($event.target as HTMLInputElement).value })" />
          </label>

          <label class="field">
            <div class="label">Flags</div>
            <input class="input" :value="selected.flags" @input="update({ flags: ($event.target as HTMLInputElement).value })" />
          </label>

          <button class="btn btn--danger" type="button" @click="remove">Delete</button>
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
  grid-template-columns: 220px 1fr;
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
.muted {
  color: #a3a3a3;
}
</style>

