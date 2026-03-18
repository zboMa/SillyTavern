<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PluginContext } from '../../plugins/types';
import type { QuickReplyButton, QuickReplyCapability } from '../../plugins/capabilities/quickReply';

const props = defineProps<{ ctx: PluginContext }>();
const qr = props.ctx.cap<QuickReplyCapability>('quickReply');

const buttons = computed(() => qr.listAllButtons());

const draftLabel = ref('New');
const draftText = ref('');
const draftCommandId = ref('');

function add() {
  const b: QuickReplyButton = {
    id: crypto.randomUUID(),
    label: draftLabel.value.trim() || 'New',
    text: draftText.value,
    commandId: draftCommandId.value.trim() || null,
    enabled: true,
    order: 100,
  };
  qr.upsertButton(b);
  draftLabel.value = 'New';
  draftText.value = '';
  draftCommandId.value = '';
}

function toggle(b: QuickReplyButton) {
  qr.upsertButton({ ...b, enabled: !b.enabled });
}

function remove(b: QuickReplyButton) {
  qr.removeButton(b.id);
}
</script>

<template>
  <section class="panel">
    <header class="panel__header">
      <h3 class="panel__title">Quick Reply</h3>
    </header>

    <div class="row">
      <input v-model="draftLabel" class="input" placeholder="Label" />
      <input v-model="draftText" class="input" placeholder="Text" />
      <input v-model="draftCommandId" class="input" placeholder="Command (optional)" />
      <button class="btn" type="button" @click="add">Add</button>
    </div>

    <div class="list">
      <div v-for="b in buttons" :key="b.id" class="item">
        <div class="item__row">
          <div class="name">{{ b.label }}</div>
          <div class="actions">
            <button class="btn btn--tiny" type="button" @click="toggle(b)">{{ b.enabled ? 'Disable' : 'Enable' }}</button>
            <button class="btn btn--tiny btn--danger" type="button" @click="remove(b)">Delete</button>
          </div>
        </div>
        <div class="meta mono">{{ b.text }}</div>
        <div v-if="b.commandId" class="meta muted">cmd: {{ b.commandId }}</div>
      </div>
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
  margin-bottom: 10px;
}
.panel__title {
  margin: 0;
  font-size: 14px;
}
.row {
  display: grid;
  grid-template-columns: 140px 1fr 200px auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.input {
  width: 100%;
  background: #121212;
  color: #f5f5f5;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 8px 10px;
}
.btn {
  background: #161616;
  color: #f5f5f5;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 6px 10px;
  cursor: pointer;
}
.btn--tiny {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
}
.btn--danger {
  border-color: #512020;
  background: #241111;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item {
  border: 1px solid #222;
  border-radius: 10px;
  padding: 8px 10px;
  background: #101010;
}
.item__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.actions {
  display: flex;
  gap: 8px;
}
.name {
  font-weight: 700;
}
.meta {
  color: #a3a3a3;
  font-size: 12px;
  margin-top: 4px;
}
.muted {
  color: #a3a3a3;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
</style>

