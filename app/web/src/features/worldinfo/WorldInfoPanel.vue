<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { defaultWorldInfoState } from './model';
import type { PluginContext } from '../../plugins/types';
import type { SettingsRegistry } from '../../plugins/capabilities/settings';
import type { CommandRegistry } from '../../plugins/capabilities/commands';
import type { KeyValueStorage } from '../../plugins/capabilities/storage';
import type { EventBus } from '../../core/events/EventBus';
import type { WorldInfoCapability } from '../../plugins/capabilities/worldinfo';
import type { WorldInfoBook, WorldInfoEntry } from './model';

const props = defineProps<{ ctx: PluginContext }>();

const settings = props.ctx.cap<SettingsRegistry>('settings');
const commands = props.ctx.cap<CommandRegistry>('commands');
const storage = props.ctx.cap<KeyValueStorage>('storage');
const events = props.ctx.cap<EventBus>('events');
const worldinfo = props.ctx.cap<WorldInfoCapability>('worldinfo');

settings.register({
  id: 'worldinfo',
  title: 'World Info',
  scope: 'user',
  schema: {
    type: 'object',
    properties: {
      depth: { type: 'number', minimum: 0, maximum: 1000 },
      budgetPercent: { type: 'number', minimum: 1, maximum: 100 },
    },
  },
  defaultValue: defaultWorldInfoState(),
});

commands.register({
  id: 'worldinfo.reset',
  title: 'World Info: Reset (local)',
  description: 'Resets local UI state stored in browser storage',
  handler: () => {
    storage.remove('worldinfo.v1');
    return true;
  },
});

const tick = ref(0);
let unsub: null | (() => void) = null;
onMounted(() => {
  unsub = events.on('worldinfo.changed', () => tick.value++);
});
onBeforeUnmount(() => unsub?.());

const state = computed(() => (tick.value, worldinfo.getState()));
const books = computed(() => state.value.books);

const selectedBookId = ref(null as string | null);
selectedBookId.value = books.value[0]?.id ?? null;
const selectedBook = computed(() => books.value.find((b: WorldInfoBook) => b.id === selectedBookId.value) ?? null);

const explain = computed(() => (tick.value, worldinfo.explainLastBuild()));

function updateSettings(patch: Partial<ReturnType<typeof worldinfo.getState>['settings']>) {
  worldinfo.setSettings({ ...worldinfo.getState().settings, ...patch });
}

function toggleGlobal(bookId: string) {
  const ids = new Set(state.value.globalSelectedBookIds ?? []);
  if (ids.has(bookId)) ids.delete(bookId);
  else ids.add(bookId);
  worldinfo.setGlobalSelected([...ids]);
}

function createBook() {
  const b = worldinfo.createBook('New Lorebook');
  selectedBookId.value = b.id;
}

function renameBook(b: WorldInfoBook, name: string) {
  worldinfo.renameBook(b.id, name);
}

function deleteBook(b: WorldInfoBook) {
  worldinfo.removeBook(b.id);
  selectedBookId.value = worldinfo.getState().books[0]?.id ?? null;
}

function addEntry() {
  const b = selectedBook.value;
  if (!b) return;
  const e: WorldInfoEntry = {
    id: crypto.randomUUID(),
    keys: '',
    secondaryKeys: '',
    content: '',
    enabled: true,
    priority: 0,
    ignoreBudget: false,
    useProbability: false,
    probability: null,
    group: '',
    groupOverride: false,
    groupWeight: 100,
    selectiveLogic: 0,
    caseSensitive: undefined,
    matchWholeWords: undefined,
    useRegex: undefined,
    depth: undefined,
    matchPersonaDescription: false,
    matchCharacterDescription: true,
    matchCharacterPersonality: true,
    matchCharacterDepthPrompt: true,
    matchScenario: true,
    matchCreatorNotes: true,
  };
  worldinfo.upsertEntry(b.id, e);
}

function updateEntry(e: WorldInfoEntry, patch: Partial<WorldInfoEntry>) {
  const b = selectedBook.value;
  if (!b) return;
  worldinfo.upsertEntry(b.id, { ...e, ...patch });
}

function removeEntry(e: WorldInfoEntry) {
  const b = selectedBook.value;
  if (!b) return;
  worldinfo.removeEntry(b.id, e.id);
}
</script>

<template>
  <section class="panel">
    <header class="panel__header">
      <h2 class="panel__title">World Info</h2>
      <p class="panel__subtitle">Lorebooks + entries + scan settings + last build explain.</p>
    </header>

    <div class="settings">
      <div class="settings__row">
        <label class="field">
          <span class="field__label">Depth</span>
          <input class="input input--sm" type="number" :value="state.settings.depth" @input="updateSettings({ depth: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <label class="field">
          <span class="field__label">Budget %</span>
          <input class="input input--sm" type="number" :value="state.settings.budgetPercent" @input="updateSettings({ budgetPercent: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <label class="field">
          <span class="field__label">Budget cap (chars)</span>
          <input class="input input--sm" type="number" :value="state.settings.budgetCap" @input="updateSettings({ budgetCap: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <label class="check">
          <input type="checkbox" :checked="state.settings.recursive" @change="updateSettings({ recursive: ($event.target as HTMLInputElement).checked })" />
          <span>Recursive</span>
        </label>
        <label class="check">
          <input type="checkbox" :checked="state.settings.includeNames" @change="updateSettings({ includeNames: ($event.target as HTMLInputElement).checked })" />
          <span>Include book names</span>
        </label>
        <label class="field">
          <span class="field__label">Insertion</span>
          <select class="input input--logic" :value="state.settings.characterStrategy" @change="updateSettings({ characterStrategy: Number(($event.target as HTMLSelectElement).value) })">
            <option :value="0">evenly</option>
            <option :value="1">character_first</option>
            <option :value="2">global_first</option>
          </select>
        </label>
        <label class="check">
          <input type="checkbox" :checked="state.settings.useGroupScoring" @change="updateSettings({ useGroupScoring: ($event.target as HTMLInputElement).checked })" />
          <span>Group scoring</span>
        </label>
        <label class="check">
          <input type="checkbox" :checked="state.settings.overflowAlert" @change="updateSettings({ overflowAlert: ($event.target as HTMLInputElement).checked })" />
          <span>Overflow alert</span>
        </label>
      </div>
      <div class="settings__row">
        <label class="check">
          <input type="checkbox" :checked="state.settings.caseSensitive" @change="updateSettings({ caseSensitive: ($event.target as HTMLInputElement).checked })" />
          <span>Case sensitive (default)</span>
        </label>
        <label class="check">
          <input type="checkbox" :checked="state.settings.matchWholeWords" @change="updateSettings({ matchWholeWords: ($event.target as HTMLInputElement).checked })" />
          <span>Whole words (default)</span>
        </label>
        <label class="field">
          <span class="field__label">Min activations</span>
          <input class="input input--sm" type="number" :value="state.settings.minActivations" @input="updateSettings({ minActivations: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <label class="field">
          <span class="field__label">Min depth max</span>
          <input class="input input--sm" type="number" :value="state.settings.minActivationsDepthMax" @input="updateSettings({ minActivationsDepthMax: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <label class="field">
          <span class="field__label">Max recursion steps</span>
          <input class="input input--sm" type="number" :value="state.settings.maxRecursionSteps" @input="updateSettings({ maxRecursionSteps: Number(($event.target as HTMLInputElement).value) })" />
        </label>
      </div>
    </div>

    <div class="grid">
      <aside class="sidebar">
        <div class="sidebar__header">
          <div class="sidebar__title">Lorebooks</div>
          <button class="btn" type="button" @click="createBook">New</button>
        </div>

        <button
          v-for="b in books"
          :key="b.id"
          class="book"
          :class="{ 'book--active': b.id === selectedBookId }"
          type="button"
          @click="selectedBookId = b.id"
        >
          <div class="book__row">
            <div class="book__name">{{ b.name }}</div>
            <label class="check" title="Global selected">
              <input type="checkbox" :checked="state.globalSelectedBookIds.includes(b.id)" @change="toggleGlobal(b.id)" />
              <span>G</span>
            </label>
          </div>
          <div class="book__meta">{{ b.entries.length }} entries</div>
        </button>
      </aside>

      <main class="editor">
        <div v-if="!selectedBook" class="muted">No lorebook selected</div>
        <template v-else>
          <div class="editor__header">
            <input class="input" :value="selectedBook.name" @input="renameBook(selectedBook, ($event.target as HTMLInputElement).value)" />
            <button class="btn btn--danger" type="button" @click="deleteBook(selectedBook)">Delete</button>
            <button class="btn" type="button" @click="addEntry">Add entry</button>
          </div>

          <div class="entries">
            <div v-for="e in selectedBook.entries" :key="e.id" class="entry">
              <div class="entry__row">
                <label class="check">
                  <input type="checkbox" :checked="e.enabled" @change="updateEntry(e, { enabled: ($event.target as HTMLInputElement).checked })" />
                  <span>On</span>
                </label>
                <input class="input" :value="e.keys" placeholder="keys (comma-separated)" @input="updateEntry(e, { keys: ($event.target as HTMLInputElement).value })" />
                <input class="input" :value="e.secondaryKeys ?? ''" placeholder="secondary keys" @input="updateEntry(e, { secondaryKeys: ($event.target as HTMLInputElement).value })" />
                <select class="input input--logic" :value="e.selectiveLogic ?? 0" @change="updateEntry(e, { selectiveLogic: Number(($event.target as HTMLSelectElement).value) })">
                  <option :value="0">AND_ANY</option>
                  <option :value="3">AND_ALL</option>
                  <option :value="2">NOT_ANY</option>
                  <option :value="1">NOT_ALL</option>
                </select>
                <input class="input input--prio" :value="e.priority" type="number" @input="updateEntry(e, { priority: Number(($event.target as HTMLInputElement).value) })" />
                <input class="input input--depth" :value="e.depth ?? ''" type="number" placeholder="depth" @input="updateEntry(e, { depth: ($event.target as HTMLInputElement).value === '' ? undefined : Number(($event.target as HTMLInputElement).value) })" />
                <button class="btn btn--danger" type="button" @click="removeEntry(e)">X</button>
              </div>
              <div class="entry__row entry__row--sub">
                <label class="check">
                  <input type="checkbox" :checked="e.caseSensitive ?? false" @change="updateEntry(e, { caseSensitive: ($event.target as HTMLInputElement).checked })" />
                  <span>Case</span>
                </label>
                <label class="check">
                  <input type="checkbox" :checked="e.matchWholeWords ?? false" @change="updateEntry(e, { matchWholeWords: ($event.target as HTMLInputElement).checked })" />
                  <span>Whole</span>
                </label>
                <label class="check">
                  <input type="checkbox" :checked="e.useRegex ?? false" @change="updateEntry(e, { useRegex: ($event.target as HTMLInputElement).checked })" />
                  <span>Regex</span>
                </label>
                <label class="check">
                  <input type="checkbox" :checked="e.matchPersonaDescription ?? false" @change="updateEntry(e, { matchPersonaDescription: ($event.target as HTMLInputElement).checked })" />
                  <span>Persona</span>
                </label>
                <label class="check">
                  <input type="checkbox" :checked="e.matchCharacterDescription ?? false" @change="updateEntry(e, { matchCharacterDescription: ($event.target as HTMLInputElement).checked })" />
                  <span>Char desc</span>
                </label>
                <label class="check">
                  <input type="checkbox" :checked="e.matchCharacterPersonality ?? false" @change="updateEntry(e, { matchCharacterPersonality: ($event.target as HTMLInputElement).checked })" />
                  <span>Personality</span>
                </label>
                <label class="check">
                  <input type="checkbox" :checked="e.matchScenario ?? false" @change="updateEntry(e, { matchScenario: ($event.target as HTMLInputElement).checked })" />
                  <span>Scenario</span>
                </label>
                <label class="check">
                  <input type="checkbox" :checked="e.matchCreatorNotes ?? false" @change="updateEntry(e, { matchCreatorNotes: ($event.target as HTMLInputElement).checked })" />
                  <span>Notes</span>
                </label>
              </div>
              <textarea class="textarea" :value="e.content" rows="3" placeholder="content" @input="updateEntry(e, { content: ($event.target as HTMLTextAreaElement).value })" />
              <div class="entry__row entry__row--sub">
                <label class="check">
                  <input type="checkbox" :checked="e.ignoreBudget ?? false" @change="updateEntry(e, { ignoreBudget: ($event.target as HTMLInputElement).checked })" />
                  <span>Ignore budget</span>
                </label>
                <label class="check">
                  <input type="checkbox" :checked="e.useProbability ?? false" @change="updateEntry(e, { useProbability: ($event.target as HTMLInputElement).checked })" />
                  <span>Use prob</span>
                </label>
                <label class="field">
                  <span class="field__label">Prob%</span>
                  <input
                    class="input input--sm"
                    type="number"
                    :value="e.probability ?? ''"
                    placeholder="100"
                    @input="updateEntry(e, { probability: (($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value)) })"
                  />
                </label>
                <label class="field">
                  <span class="field__label">Group</span>
                  <input class="input" :value="e.group ?? ''" placeholder="group name" @input="updateEntry(e, { group: ($event.target as HTMLInputElement).value })" />
                </label>
                <label class="check">
                  <input type="checkbox" :checked="e.groupOverride ?? false" @change="updateEntry(e, { groupOverride: ($event.target as HTMLInputElement).checked })" />
                  <span>Group override</span>
                </label>
                <label class="field">
                  <span class="field__label">Weight</span>
                  <input class="input input--sm" type="number" :value="e.groupWeight ?? 100" @input="updateEntry(e, { groupWeight: Number(($event.target as HTMLInputElement).value) })" />
                </label>
              </div>
            </div>
          </div>
        </template>
      </main>
    </div>

    <details class="explain">
      <summary>Last build explain</summary>
      <div class="explain__meta">
        <div><span class="muted">Selected books:</span> <span class="mono">{{ explain.selectedBooks.join(', ') }}</span></div>
        <div><span class="muted">Matched entry ids:</span> <span class="mono">{{ explain.matchedEntryIds.join(', ') }}</span></div>
        <div>
          <span class="muted">Budget used/cap (chars):</span>
          <span class="mono">{{ explain.budgetUsedChars }}</span>/<span class="mono">{{ explain.budgetCapChars }}</span>
          <span v-if="explain.overflowed" class="pill pill--danger">overflow</span>
        </div>
        <div><span class="muted">Entries by source:</span> <span class="mono">{{ JSON.stringify(explain.entriesBySource) }}</span></div>
      </div>
      <div class="explain__logs">
        <div v-for="(lines, id) in explain.logs" :key="id" class="explain__log">
          <div class="mono explain__id">{{ id }}</div>
          <div class="mono" v-for="(l, idx) in lines" :key="idx">{{ l }}</div>
        </div>
      </div>
    </details>
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
  margin-bottom: 12px;
}
.panel__title {
  margin: 0 0 6px;
  font-size: 18px;
}
.panel__subtitle {
  margin: 0;
  color: #a3a3a3;
  font-size: 13px;
}
.grid {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 12px;
}
.settings {
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 12px;
  background: #101010;
}
.settings__row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
}
.settings__row:last-child {
  margin-bottom: 0;
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field__label {
  font-size: 12px;
  color: #c7c7c7;
  font-weight: 700;
}
.input--sm {
  width: 110px;
}
.input--logic {
  width: 130px;
}
.input--depth {
  width: 90px;
}
.entry__row--sub {
  margin-top: 6px;
  gap: 10px;
  flex-wrap: wrap;
}
.explain {
  margin-top: 12px;
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
  background: #101010;
}
.explain__meta {
  display: grid;
  gap: 6px;
  margin: 8px 0 10px;
}
.explain__logs {
  display: grid;
  gap: 10px;
}
.explain__log {
  border: 1px solid #222;
  border-radius: 10px;
  padding: 8px;
  background: #0b0b0b;
}
.explain__id {
  margin-bottom: 6px;
  color: #f5f5f5;
}
.sidebar {
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sidebar__header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sidebar__title {
  font-size: 12px;
  color: #c7c7c7;
  font-weight: 700;
}
.muted {
  color: #a3a3a3;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.book {
  text-align: left;
  background: #101010;
  color: #f5f5f5;
  border: 1px solid #222;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
}
.book--active {
  border-color: #3a3a3a;
  background: #151515;
}
.book__row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.book__name {
  font-weight: 700;
}
.book__meta {
  color: #a3a3a3;
  font-size: 12px;
  margin-top: 4px;
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
.entries {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.entry {
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
  background: #0f0f0f;
}
.entry__row {
  display: grid;
  grid-template-columns: auto 1fr 90px auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #c7c7c7;
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
.input--prio {
  text-align: right;
}
.textarea {
  resize: vertical;
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
  background: #241111;
}
</style>

