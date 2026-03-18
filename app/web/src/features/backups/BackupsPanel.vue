<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { PluginContext } from '../../plugins/types';
import type { ChatBackupsCapability } from '../../plugins/capabilities/chatBackups';
import type { ChatFilesCapability, ChatBackupInfo } from '../../plugins/capabilities/chatFiles';

const props = defineProps<{ ctx: PluginContext }>();
const backups = props.ctx.cap<ChatBackupsCapability>('chatBackups');
const chatFiles = props.ctx.cap<ChatFilesCapability>('chatFiles');

function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function exportNow() {
  const payload = backups.exportBackup();
  downloadJson(payload, `st-backup-${new Date().toISOString()}.json`);
}

const list = ref<ChatBackupInfo[]>([]);
const loading = ref(false);
async function refresh() {
  loading.value = true;
  try {
    list.value = await chatFiles.listBackups();
  } finally {
    loading.value = false;
  }
}
onMounted(() => {
  void refresh();
});

async function download(name: string) {
  const blob = await chatFiles.downloadBackup(name);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function del(name: string) {
  await chatFiles.deleteBackup(name);
  await refresh();
}

const inputRef = ref<HTMLInputElement | null>(null);
function importClick() {
  inputRef.value?.click();
}

async function onImport(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  if (!file) return;
  try {
    const text = await file.text();
    backups.importBackup(JSON.parse(text));
    await refresh();
  } catch {
    // ignore for now
  } finally {
    input.value = '';
  }
}
</script>

<template>
  <section class="panel">
    <header class="panel__header">
      <h3 class="panel__title">Backup</h3>
    </header>
    <div class="row">
      <button class="btn" type="button" @click="exportNow">Export</button>
      <input ref="inputRef" class="hidden" type="file" accept="application/json,.json" @change="onImport" />
      <button class="btn" type="button" @click="importClick">Import</button>
      <button class="btn" type="button" :disabled="loading" @click="refresh">Refresh list</button>
    </div>

    <div class="list">
      <div v-if="loading" class="muted">Loading…</div>
      <div v-else-if="!list.length" class="muted">No server backups found.</div>
      <div v-for="b in list" :key="b.file_name" class="item">
        <div class="item__name mono">{{ b.file_name }}</div>
        <div class="item__actions">
          <button class="btn btn--tiny" type="button" @click="download(b.file_name)">Download</button>
          <button class="btn btn--tiny btn--danger" type="button" @click="del(b.file_name)">Delete</button>
        </div>
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
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid #222;
  border-radius: 10px;
  padding: 8px 10px;
  background: #101010;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
.muted {
  color: #a3a3a3;
}
.hidden {
  display: none;
}
</style>

