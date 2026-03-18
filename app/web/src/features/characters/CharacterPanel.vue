<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { PluginContext } from '../../plugins/types';
import type { CharactersCapability } from '../../plugins/capabilities/characters';
import type { CharacterCard } from '../../core/characters/model';
import type { TagsCapability } from '../../plugins/capabilities/tags';
import { exportCharacter, importCharacter } from '../../core/characters/format';
import type { CharacterChatBindingCapability } from '../../plugins/capabilities/bindings';
import { exportCharacterToPngBlob, importCharacterFromPngFile, importCharacterFromTavernJson } from '../../core/characters/tavern';
import type { WorldInfoCapability } from '../../plugins/capabilities/worldinfo';
import type { WorldInfoEntry } from '../worldinfo/model';
import type { CharacterRegexScript } from '../../core/characters/model';
import type { KeyValueStorage } from '../../plugins/capabilities/storage';

const props = defineProps<{ ctx: PluginContext }>();
const characters = props.ctx.cap<CharactersCapability>('characters');
const tagsCap = props.ctx.cap<TagsCapability>('tags');
const bindings = props.ctx.cap<CharacterChatBindingCapability>('bindings');
const worldinfo = props.ctx.cap<WorldInfoCapability>('worldinfo');
const storage = props.ctx.cap<KeyValueStorage>('storage');

const query = ref('');
const folderFilter = ref('');
const tagFilter = ref('');

type CharactersUiStateV1 = {
  version: 1;
  query: string;
  folderFilter: string;
  tagFilter: string;
  openFolders: Record<string, boolean>;
};

const uiKey = 'characters.ui.v1';
const openFolders = ref<Record<string, boolean>>({});

function loadUi() {
  try {
    const raw = storage.getString(uiKey);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<CharactersUiStateV1>;
    if (parsed?.version !== 1) return;
    if (typeof parsed.query === 'string') query.value = parsed.query;
    if (typeof parsed.folderFilter === 'string') folderFilter.value = parsed.folderFilter;
    if (typeof parsed.tagFilter === 'string') tagFilter.value = parsed.tagFilter;
    if (parsed.openFolders && typeof parsed.openFolders === 'object') openFolders.value = parsed.openFolders as any;
  } catch {
    // ignore
  }
}

function saveUi() {
  const payload: CharactersUiStateV1 = {
    version: 1,
    query: query.value,
    folderFilter: folderFilter.value,
    tagFilter: tagFilter.value,
    openFolders: openFolders.value,
  };
  storage.setString(uiKey, JSON.stringify(payload));
}

onMounted(() => loadUi());
watch([query, folderFilter, tagFilter, openFolders], () => saveUi(), { deep: true });

const allFolders = computed(() => {
  const set = new Set<string>();
  for (const c of characters.list()) {
    const f = String((c as any).folder ?? '').trim();
    if (f) set.add(f);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
});

const allTagNames = computed(() => tagsCap.list().map((t) => t.name).sort((a, b) => a.localeCompare(b)));

function folderOf(c: CharacterCard): string {
  return String((c as any).folder ?? '').trim();
}

const groupedByFolder = computed(() => {
  const map = new Map<string, CharacterCard[]>();
  for (const c of characters.list()) {
    const f = folderOf(c) || '(no folder)';
    const arr = map.get(f) ?? [];
    arr.push(c);
    map.set(f, arr);
  }
  const items = [...map.entries()].map(([folder, cards]) => ({
    folder,
    cards: cards
      .slice()
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt - a.updatedAt || a.name.localeCompare(b.name)),
  }));
  items.sort((a, b) => {
    if (a.folder === '(no folder)') return 1;
    if (b.folder === '(no folder)') return -1;
    return a.folder.localeCompare(b.folder);
  });
  return items;
});

function isFolderOpen(name: string): boolean {
  const v = openFolders.value[name];
  if (typeof v === 'boolean') return v;
  // default: open
  return true;
}

function toggleFolderOpen(name: string) {
  openFolders.value = { ...openFolders.value, [name]: !isFolderOpen(name) };
}

const list = computed(() => {
  const q = query.value.trim().toLowerCase();
  const folder = folderFilter.value.trim().toLowerCase();
  const tag = tagFilter.value.trim().toLowerCase();
  const items = characters.list();
  return items
    .filter((c) => {
      if (folder) {
        const f = String((c as any).folder ?? '').toLowerCase();
        if (f !== folder) return false;
      }
      if (tag) {
        if (!c.tags.some((t) => t.name.toLowerCase() === tag)) return false;
      }
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.tags.some((t) => t.name.toLowerCase().includes(q));
    })
    .slice();
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

function upsertRegexScript(id: string, patch: Partial<CharacterRegexScript>) {
  const a = active.value;
  if (!a) return;
  const next = (a.regexScripts ?? []).map((s) => (s.id === id ? ({ ...s, ...patch } as any) : s));
  update({ regexScripts: next });
}

function addRegexScript() {
  const a = active.value;
  if (!a) return;
  const s: CharacterRegexScript = {
    id: crypto.randomUUID(),
    scriptName: 'New script',
    findRegex: '',
    replaceString: '',
    trimStrings: [],
    placement: [1], // USER_INPUT
    disabled: false,
    markdownOnly: false,
    promptOnly: true,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: -1,
    maxDepth: null as any,
  };
  update({ regexScripts: [s, ...(a.regexScripts ?? [])] });
}

function removeRegexScript(id: string) {
  const a = active.value;
  if (!a) return;
  update({ regexScripts: (a.regexScripts ?? []).filter((x) => x.id !== id) });
}

function togglePlacement(s: CharacterRegexScript, place: number) {
  const cur = Array.isArray(s.placement) ? s.placement : [];
  const set = new Set(cur);
  if (set.has(place)) set.delete(place);
  else set.add(place);
  upsertRegexScript(s.id, { placement: [...set] });
}

function runCharacterRegexScriptTest(s: CharacterRegexScript, input: string): string {
  // Mirrors the simplified runtime behavior we added to RegexCapability for character regex scripts.
  if (!s || s.disabled) return input;
  const raw = String(input ?? '');
  if (!raw || !s.findRegex) return raw;

  const parse = (x: string): RegExp | null => {
    const t = String(x ?? '').trim();
    if (!t) return null;
    if (t.startsWith('/') && t.lastIndexOf('/') > 0) {
      const last = t.lastIndexOf('/');
      const body = t.slice(1, last);
      const flags = t.slice(last + 1);
      try {
        return new RegExp(body, flags);
      } catch {
        return null;
      }
    }
    try {
      return new RegExp(t, 'g');
    } catch {
      return null;
    }
  };
  const re = parse(String(s.findRegex ?? ''));
  if (!re) return raw;

  const trimStrings = Array.isArray(s.trimStrings) ? s.trimStrings : [];
  const replaceString = String(s.replaceString ?? '').replace(/{{match}}/gi, '$0');
  return raw.replace(re, (...args: any[]) => {
    const groups = args[args.length - 1];
    const getGroup = (num?: number, name?: string) => {
      let v: any = '';
      if (typeof num === 'number') v = args[num];
      else if (name && groups && typeof groups === 'object') v = groups[name];
      v = String(v ?? '');
      for (const t of trimStrings) v = v.replaceAll(String(t ?? ''), '');
      return v;
    };
    return replaceString.replaceAll(/\$(\d+)|\$<([^>]+)>/g, (_m: string, num: string, groupName: string) => {
      if (num) return getGroup(Number(num));
      if (groupName) return getGroup(undefined, groupName);
      return '';
    });
  });
}

const regexTestInput = ref('');
const regexTestOutput = computed(() => {
  const a = active.value;
  if (!a) return '';
  const first = (a.regexScripts ?? [])[0] ?? null;
  if (!first) return '';
  return runCharacterRegexScriptTest(first, regexTestInput.value);
});

function altGreetingsToText(c: CharacterCard) {
  return (c.alternateGreetings ?? []).join('\n');
}

function parseAltGreetings(text: string) {
  return text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
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
      const created = characters.create({
        ...card,
        tags,
      });

      // If character has an embedded character_book, import it into WorldInfo and bind.
      if (!created.worldInfoId && created.characterBook && created.characterBook.entries?.length) {
        const bookName = created.characterBook.name || `${created.name} (character book)`;
        const b = worldinfo.createBook(bookName);
        for (const raw of created.characterBook.entries) {
          const keys = Array.isArray((raw as any).keys) ? (raw as any).keys : [];
          const secondary = Array.isArray((raw as any).secondary_keys) ? (raw as any).secondary_keys : [];
          const enabled = typeof (raw as any).enabled === 'boolean' ? Boolean((raw as any).enabled) : true;
          const priority = typeof (raw as any).insertion_order === 'number' ? Number((raw as any).insertion_order) : 0;
          const e2: WorldInfoEntry = {
            id: crypto.randomUUID(),
            keys: keys.join(', '),
            secondaryKeys: secondary.join(', '),
            content: String((raw as any).content ?? ''),
            enabled,
            priority,
            selectiveLogic: Number((raw as any)?.extensions?.selectiveLogic ?? 0),
            depth: typeof (raw as any)?.extensions?.scan_depth === 'number' ? Number((raw as any).extensions.scan_depth) : undefined,
            caseSensitive: typeof (raw as any)?.extensions?.case_sensitive === 'boolean' ? Boolean((raw as any).extensions.case_sensitive) : undefined,
            matchWholeWords: typeof (raw as any)?.extensions?.match_whole_words === 'boolean' ? Boolean((raw as any).extensions.match_whole_words) : undefined,
            matchPersonaDescription: Boolean((raw as any)?.extensions?.match_persona_description ?? false),
            matchCharacterDescription: Boolean((raw as any)?.extensions?.match_character_description ?? true),
            matchCharacterPersonality: Boolean((raw as any)?.extensions?.match_character_personality ?? true),
            matchCharacterDepthPrompt: Boolean((raw as any)?.extensions?.match_character_depth_prompt ?? true),
            matchScenario: Boolean((raw as any)?.extensions?.match_scenario ?? true),
            matchCreatorNotes: Boolean((raw as any)?.extensions?.match_creator_notes ?? true),
            source: 'character',
          };
          worldinfo.upsertEntry(b.id, e2);
        }
        characters.upsert({ ...created, worldInfoId: b.id });
      }
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
        <div class="filters">
          <select class="input" v-model="folderFilter">
            <option value="">All folders</option>
            <option v-for="f in allFolders" :key="f" :value="f">{{ f }}</option>
          </select>
          <select class="input" v-model="tagFilter">
            <option value="">All tags</option>
            <option v-for="t in allTagNames" :key="t" :value="t">{{ t }}</option>
          </select>
          <button class="btn" type="button" @click="folderFilter = ''; tagFilter = ''">Clear</button>
        </div>
        <template v-if="folderFilter || tagFilter || query.trim()">
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
        </template>
        <template v-else>
          <div v-for="g in groupedByFolder" :key="g.folder" class="folder">
            <button class="folder__head" type="button" @click="toggleFolderOpen(g.folder)">
              <span class="folder__chev">{{ isFolderOpen(g.folder) ? '▾' : '▸' }}</span>
              <span class="folder__name">{{ g.folder }}</span>
              <span class="folder__count">{{ g.cards.length }}</span>
            </button>
            <div v-if="isFolderOpen(g.folder)" class="folder__list">
              <button
                v-for="c in g.cards"
                :key="c.id"
                class="card card--inFolder"
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
            </div>
          </div>
        </template>
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
              <div class="field__label">Post history instructions</div>
              <textarea
                class="textarea"
                :value="active.postHistoryInstructions"
                rows="3"
                @input="update({ postHistoryInstructions: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>

            <label class="field">
              <div class="field__label">Creator</div>
              <input class="input" :value="active.creator" type="text" @input="update({ creator: ($event.target as HTMLInputElement).value })" />
            </label>

            <label class="field">
              <div class="field__label">Talkativeness</div>
              <input class="input" :value="active.talkativeness" type="number" @input="update({ talkativeness: Number(($event.target as HTMLInputElement).value) })" />
            </label>

            <label class="field">
              <div class="field__label">World</div>
              <input class="input" :value="active.world" type="text" @input="update({ world: ($event.target as HTMLInputElement).value })" />
            </label>

            <label class="field">
              <div class="field__label">Folder</div>
              <div class="row2">
                <input class="input" :value="active.folder" placeholder="folder name" @input="update({ folder: ($event.target as HTMLInputElement).value })" />
                <button class="btn" type="button" @click="update({ folder: '' })">Clear</button>
              </div>
            </label>

            <div class="field">
              <div class="field__label">Depth prompt</div>
              <div class="row3">
                <select
                  class="input"
                  :value="active.depthPrompt?.role ?? 'system'"
                  @change="update({ depthPrompt: { depth: active.depthPrompt?.depth ?? 0, prompt: active.depthPrompt?.prompt ?? '', role: ($event.target as HTMLSelectElement).value as any } })"
                >
                  <option value="system">system</option>
                  <option value="user">user</option>
                  <option value="assistant">assistant</option>
                </select>
                <input
                  class="input"
                  type="number"
                  :value="active.depthPrompt?.depth ?? 0"
                  @input="update({ depthPrompt: { depth: Number(($event.target as HTMLInputElement).value), prompt: active.depthPrompt?.prompt ?? '', role: active.depthPrompt?.role ?? 'system' } })"
                />
                <button class="btn" type="button" @click="update({ depthPrompt: null })">Clear</button>
              </div>
              <textarea
                class="textarea"
                :value="active.depthPrompt?.prompt ?? ''"
                rows="2"
                placeholder="depth prompt"
                @input="update({ depthPrompt: { depth: active.depthPrompt?.depth ?? 0, prompt: ($event.target as HTMLTextAreaElement).value, role: active.depthPrompt?.role ?? 'system' } })"
              />
            </div>

            <label class="field">
              <div class="field__label">Alternate greetings (one per line)</div>
              <textarea class="textarea" :value="altGreetingsToText(active)" rows="4" @input="update({ alternateGreetings: parseAltGreetings(($event.target as HTMLTextAreaElement).value) })" />
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
              <div class="field__label">World Info binding</div>
              <select class="input" :value="active.worldInfoId ?? ''" @change="update({ worldInfoId: ($event.target as HTMLSelectElement).value || null })">
                <option value="">(none)</option>
                <option v-for="b in worldinfo.getState().books" :key="b.id" :value="b.id">{{ b.name }}</option>
              </select>
            </label>

            <div class="field">
              <div class="field__label rowBetween">
                <span>Regex scripts (character scoped)</span>
                <button class="btn" type="button" @click="addRegexScript">Add script</button>
              </div>
              <div v-if="!(active.regexScripts?.length)" class="muted">No regex scripts on this character.</div>
              <div v-for="s in active.regexScripts" :key="s.id" class="rx">
                <div class="rx__row">
                  <label class="check">
                    <input type="checkbox" :checked="!(s.disabled ?? false)" @change="upsertRegexScript(s.id, { disabled: !($event.target as HTMLInputElement).checked })" />
                    <span>On</span>
                  </label>
                  <input class="input" :value="s.scriptName ?? ''" placeholder="scriptName" @input="upsertRegexScript(s.id, { scriptName: ($event.target as HTMLInputElement).value })" />
                  <button class="btn btn--danger" type="button" @click="removeRegexScript(s.id)">Delete</button>
                </div>

                <div class="rx__row rx__row--places">
                  <span class="muted">Affects:</span>
                  <label class="check">
                    <input type="checkbox" :checked="(s.placement ?? []).includes(1)" @change="togglePlacement(s, 1)" />
                    <span>USER_INPUT</span>
                  </label>
                  <label class="check">
                    <input type="checkbox" :checked="(s.placement ?? []).includes(5)" @change="togglePlacement(s, 5)" />
                    <span>WORLD_INFO</span>
                  </label>
                  <label class="check">
                    <input type="checkbox" :checked="(s.placement ?? []).includes(2)" @change="togglePlacement(s, 2)" />
                    <span>AI_OUTPUT</span>
                  </label>
                  <label class="check">
                    <input type="checkbox" :checked="(s.placement ?? []).includes(6)" @change="togglePlacement(s, 6)" />
                    <span>REASONING</span>
                  </label>
                </div>

                <div class="rx__row">
                  <label class="check">
                    <input type="checkbox" :checked="s.promptOnly ?? true" @change="upsertRegexScript(s.id, { promptOnly: ($event.target as HTMLInputElement).checked })" />
                    <span>Prompt only</span>
                  </label>
                  <label class="check">
                    <input type="checkbox" :checked="s.markdownOnly ?? false" @change="upsertRegexScript(s.id, { markdownOnly: ($event.target as HTMLInputElement).checked })" />
                    <span>Markdown only</span>
                  </label>
                  <label class="check">
                    <input type="checkbox" :checked="s.runOnEdit ?? false" @change="upsertRegexScript(s.id, { runOnEdit: ($event.target as HTMLInputElement).checked })" />
                    <span>Run on edit</span>
                  </label>
                  <label class="fieldInline">
                    <span class="muted">minDepth</span>
                    <input class="input input--sm" type="number" :value="s.minDepth ?? -1" @input="upsertRegexScript(s.id, { minDepth: Number(($event.target as HTMLInputElement).value) })" />
                  </label>
                  <label class="fieldInline">
                    <span class="muted">maxDepth</span>
                    <input
                      class="input input--sm"
                      type="number"
                      :value="s.maxDepth ?? ''"
                      @input="upsertRegexScript(s.id, { maxDepth: ($event.target as HTMLInputElement).value === '' ? (null as any) : Number(($event.target as HTMLInputElement).value) })"
                    />
                  </label>
                </div>

                <label class="field">
                  <div class="field__label">Find regex</div>
                  <input class="input" :value="s.findRegex ?? ''" placeholder="/.../gi or raw pattern" @input="upsertRegexScript(s.id, { findRegex: ($event.target as HTMLInputElement).value })" />
                </label>
                <label class="field">
                  <div class="field__label">Replace</div>
                  <input class="input" :value="s.replaceString ?? ''" placeholder="supports {{match}}, $1, $<name>" @input="upsertRegexScript(s.id, { replaceString: ($event.target as HTMLInputElement).value })" />
                </label>
                <label class="field">
                  <div class="field__label">Trim strings (one per line)</div>
                  <textarea
                    class="textarea"
                    :value="(s.trimStrings ?? []).join('\n')"
                    rows="2"
                    @input="upsertRegexScript(s.id, { trimStrings: String(($event.target as HTMLTextAreaElement).value ?? '').split('\n').filter((x) => x.trim().length) })"
                  />
                </label>
              </div>

              <details class="rxTest">
                <summary>Quick test (first script)</summary>
                <textarea class="textarea" v-model="regexTestInput" rows="2" placeholder="test input..." />
                <div class="mono rxTest__out">{{ regexTestOutput }}</div>
              </details>
            </div>
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
.filters {
  display: grid;
  gap: 8px;
}
.folder {
  border: 1px solid #222;
  border-radius: 10px;
  background: #0f0f0f;
  overflow: hidden;
}
.folder + .folder {
  margin-top: 8px;
}
.folder__head {
  width: 100%;
  display: grid;
  grid-template-columns: 18px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  background: #121212;
  border: 0;
  color: inherit;
  cursor: pointer;
}
.folder__chev {
  color: #a3a3a3;
}
.folder__name {
  font-weight: 800;
}
.folder__count {
  color: #a3a3a3;
  font-size: 12px;
}
.folder__list {
  display: grid;
  gap: 8px;
  padding: 8px;
}
.card--inFolder {
  border-color: #1f1f1f;
  background: #0b0b0b;
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
.row3 {
  display: grid;
  grid-template-columns: 160px 1fr auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.rowBetween {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.fieldInline {
  display: flex;
  align-items: center;
  gap: 8px;
}
.input--sm {
  width: 90px;
}
.rx {
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
  background: #0f0f0f;
  display: grid;
  gap: 8px;
  margin-top: 8px;
}
.rx__row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.rx__row--places {
  gap: 10px;
}
.rxTest {
  margin-top: 10px;
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
  background: #101010;
}
.rxTest__out {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid #222;
  border-radius: 10px;
  background: #0b0b0b;
  white-space: pre-wrap;
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

