<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PluginContext } from '../../plugins/types';
import type { CharactersCapability } from '../../plugins/capabilities/characters';
import type { CharacterCard } from '../../core/characters/model';
import type { TagsCapability } from '../../plugins/capabilities/tags';
import { exportCharacter, importCharacter } from '../../core/characters/format';
import type { CharacterChatBindingCapability } from '../../plugins/capabilities/bindings';
import { exportCharacterToPngBlob, importCharacterFromPngFile, importCharacterFromTavernJson } from '../../core/characters/tavern';

const props = defineProps<{ ctx: PluginContext }>();
const characters = props.ctx.cap<CharactersCapability>('characters');
const tagsCap = props.ctx.cap<TagsCapability>('tags');
const bindings = props.ctx.cap<CharacterChatBindingCapability>('bindings');

const query = ref('');
const list = computed(() => {
  const q = query.value.trim().toLowerCase();
  const items = characters.list();
  if (!q) return items;
  return items.filter((c) => {
    return (
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.tags.some((t) => t.name.toLowerCase().includes(q))
    );
  });
});

const active = computed(() => characters.getActive());

function select(id: string) {
  characters.setActive(id);
  bindings.ensureActiveChatForActiveCharacter();
}

function createNew() {
  characters.create({ name: 'New Character' });
}

function duplicateActive() {
  const a = active.value;
  if (!a) return;
  characters.duplicate(a.id);
}

function deleteActive() {
  const a = active.value;
  if (!a) return;
  characters.remove(a.id);
}

function toggleFav() {
  const a = active.value;
  if (!a) return;
  characters.upsert({ ...a, favorite: !a.favorite });
}

function update(patch: Partial<CharacterCard>) {
  const a = active.value;
  if (!a) return;
  characters.upsert({ ...a, ...patch });
}

function tagsToString(c: CharacterCard) {
  return c.tags.map((t) => t.name).join(', ');
}

function parseTags(input: string) {
  const uniq = new Set(
    input
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => x.toLowerCase()),
  );
  return [...uniq].map((name) => tagsCap.upsertByName(name));
}

function exportActive() {
  const a = active.value;
  if (!a) return;
  const payload = exportCharacter(a);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${a.name || 'character'}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportActivePng() {
  const a = active.value;
  if (!a) return;
  const blob = await exportCharacterToPngBlob(a);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${a.name || 'character'}.png`;
  link.click();
  URL.revokeObjectURL(url);
}

const importInputRef = ref<HTMLInputElement | null>(null);
function importClick() {
  importInputRef.value?.click();
}

const avatarInputRef = ref<HTMLInputElement | null>(null);
function avatarClick() {
  avatarInputRef.value?.click();
}

async function onAvatarFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  if (!file) return;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
  update({ avatarUrl: dataUrl });
  input.value = '';
}

async function onImportFiles(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = input.files ? Array.from(input.files) : [];
  for (const f of files) {
    try {
      let card: CharacterCard | null = null;
      if (f.name.toLowerCase().endsWith('.png')) {
        card = await importCharacterFromPngFile(f);
      } else {
        const text = await f.text();
        const parsed = JSON.parse(text);
        card = importCharacterFromTavernJson(parsed) ?? importCharacter(parsed);
      }
      if (!card) {
        continue;
      }
      // Ensure tags exist in global tags registry
      const tags = card.tags.map((t) => tagsCap.upsertByName(t.name));
      characters.create({
        ...card,
        tags,
      });
    } catch {
      // ignore invalid files for now
    }
  }
  input.value = '';
}

const draftName = ref('');
watch(
  () => active.value?.id,
  () => {
    draftName.value = active.value?.name ?? '';
  },
  { immediate: true },
);
</script>

<template>
  <section class="panel">
    <header class="panel__header">
      <h2 class="panel__title">Characters</h2>
      <div class="actions">
        <input
          ref="importInputRef"
          class="hidden"
          type="file"
          accept="application/json,.json,image/png,.png"
          multiple
          @change="onImportFiles"
        />
        <button class="btn" type="button" @click="importClick">Import</button>
        <button class="btn" type="button" :disabled="!active" @click="exportActive">Export</button>
        <button class="btn" type="button" :disabled="!active" @click="exportActivePng">Export PNG</button>
        <button class="btn" type="button" @click="createNew">New</button>
        <button class="btn" type="button" :disabled="!active" @click="duplicateActive">Duplicate</button>
        <button class="btn btn--danger" type="button" :disabled="!active" @click="deleteActive">Delete</button>
      </div>
    </header>

    <div class="grid">
      <aside class="sidebar">
        <input v-model="query" class="search" type="search" placeholder="Search..." />
        <button
          v-for="c in list"
          :key="c.id"
          class="card"
          :class="{ 'card--active': c.id === active?.id }"
          type="button"
          @click="select(c.id)"
        >
          <div class="card__row">
            <div class="card__name">{{ c.name }}</div>
            <div class="card__fav" :title="c.favorite ? 'Favorite' : 'Not favorite'">
              {{ c.favorite ? '★' : '☆' }}
            </div>
          </div>
          <div class="card__desc">{{ c.description || '—' }}</div>
        </button>
      </aside>

      <main class="editor">
        <div v-if="!active" class="muted">No character selected</div>
        <template v-else>
          <div class="editor__header">
            <div class="editor__title">Editor</div>
            <button class="btn" type="button" @click="toggleFav">Toggle fav</button>
          </div>

          <div class="form">
            <label class="field">
              <div class="field__label">Name</div>
              <input
                v-model="draftName"
                class="input"
                type="text"
                @blur="update({ name: draftName })"
                @keydown.enter.prevent="update({ name: draftName })"
              />
            </label>

            <label class="field">
              <div class="field__label">Description</div>
              <textarea class="textarea" :value="active.description" rows="3" @input="update({ description: ($event.target as HTMLTextAreaElement).value })" />
            </label>

            <label class="field">
              <div class="field__label">Personality</div>
              <textarea class="textarea" :value="active.personality" rows="3" @input="update({ personality: ($event.target as HTMLTextAreaElement).value })" />
            </label>

            <label class="field">
              <div class="field__label">Scenario</div>
              <textarea class="textarea" :value="active.scenario" rows="3" @input="update({ scenario: ($event.target as HTMLTextAreaElement).value })" />
            </label>

            <label class="field">
              <div class="field__label">First message</div>
              <textarea class="textarea" :value="active.firstMessage" rows="3" @input="update({ firstMessage: ($event.target as HTMLTextAreaElement).value })" />
            </label>

            <label class="field">
              <div class="field__label">Example messages</div>
              <textarea class="textarea" :value="active.exampleMessages" rows="3" @input="update({ exampleMessages: ($event.target as HTMLTextAreaElement).value })" />
            </label>

            <label class="field">
              <div class="field__label">Creator notes</div>
              <textarea class="textarea" :value="active.creatorNotes" rows="3" @input="update({ creatorNotes: ($event.target as HTMLTextAreaElement).value })" />
            </label>

            <label class="field">
              <div class="field__label">System prompt</div>
              <textarea class="textarea" :value="active.systemPrompt" rows="3" @input="update({ systemPrompt: ($event.target as HTMLTextAreaElement).value })" />
            </label>

            <label class="field">
              <div class="field__label">Tags (comma-separated)</div>
              <input class="input" :value="tagsToString(active)" placeholder="tag1, tag2" @input="update({ tags: parseTags(($event.target as HTMLInputElement).value) })" />
            </label>

            <label class="field">
              <div class="field__label">Avatar URL</div>
              <div class="row2">
                <input class="input" :value="active.avatarUrl ?? ''" placeholder="https://... or data:image/..." @input="update({ avatarUrl: ($event.target as HTMLInputElement).value })" />
                <input ref="avatarInputRef" class="hidden" type="file" accept="image/*" @change="onAvatarFile" />
                <button class="btn" type="button" :disabled="!active" @click="avatarClick">Upload</button>
              </div>
            </label>

            <label class="field">
              <div class="field__label">World Info binding (placeholder)</div>
              <input class="input" :value="active.worldInfoId ?? ''" placeholder="worldinfo id/name" @input="update({ worldInfoId: ($event.target as HTMLInputElement).value })" />
            </label>
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
  padding: 16px;
  background: #0b0b0b;
}
.panel__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.panel__title {
  margin: 0;
  font-size: 18px;
}
.btn {
  background: #161616;
  color: #f5f5f5;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 6px 10px;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn--danger {
  border-color: #512020;
  background: #1a0e0e;
}
.hidden {
  display: none;
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
.search {
  background: #121212;
  color: #f5f5f5;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 8px 10px;
}
.card {
  text-align: left;
  border: 1px solid #222;
  background: #0f0f0f;
  color: inherit;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
}
.card--active {
  border-color: #3a3a3a;
  background: #141414;
}
.card__row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}
.card__name {
  font-weight: 700;
}
.card__fav {
  color: #c7c7c7;
}
.card__desc {
  margin-top: 6px;
  font-size: 12px;
  color: #a3a3a3;
  line-height: 1.3;
}
.editor {
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
}
.editor__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.editor__title {
  font-weight: 800;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.field__label {
  font-size: 12px;
  color: #c7c7c7;
  margin-bottom: 6px;
}
.row2 {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}
.input,
.textarea {
  width: 100%;
  background: #121212;
  color: #f5f5f5;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 8px 10px;
}
.textarea {
  resize: vertical;
}
.muted {
  color: #a3a3a3;
}
</style>

