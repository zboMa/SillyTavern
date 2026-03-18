<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ChatCapability } from '../../plugins/capabilities/chat';
import type { PluginContext } from '../../plugins/types';
import type { CharactersCapability } from '../../plugins/capabilities/characters';
import type { CharacterChatBindingCapability } from '../../plugins/capabilities/bindings';
import type { EventBus } from '../../core/events/EventBus';
import type { GenerationCapability } from '../../plugins/capabilities/generation';
import type { TokensCapability } from '../../plugins/capabilities/tokens';
import type { SlashCapability } from '../../plugins/capabilities/slash';
import type { QuickReplyCapability } from '../../plugins/capabilities/quickReply';
import type { CommandRegistry } from '../../plugins/capabilities/commands';
import type { PresetsCapability } from '../../plugins/capabilities/presets';

const props = defineProps<{
  ctx: PluginContext;
}>();

const chat = props.ctx.cap<ChatCapability>('chat');
const characters = props.ctx.cap<CharactersCapability>('characters');
const bindings = props.ctx.cap<CharacterChatBindingCapability>('bindings');
const events = props.ctx.cap<EventBus>('events');
const generation = props.ctx.cap<GenerationCapability>('generation');
const tokens = props.ctx.cap<TokensCapability>('tokens');
const slash = props.ctx.cap<SlashCapability>('slash');
const quickReply = props.ctx.cap<QuickReplyCapability>('quickReply');
const commands = props.ctx.cap<CommandRegistry>('commands');
const presets = props.ctx.cap<PresetsCapability>('presets' as any);

function formatReasoning(raw: string): string {
  const master = presets.getMaster?.() ?? {};
  const tpl = (master as any).reasoning;
  if (!tpl || typeof tpl !== 'object') return raw;
  const prefix = String(tpl.prefix ?? '');
  const sep = String(tpl.separator ?? '\n');
  const suffix = String(tpl.suffix ?? '');
  const content = String(raw ?? '');
  if (!content.trim()) return content;
  const lines = content.split(/\r?\n/);
  return `${prefix}${lines.join(sep)}${suffix}`;
}

const tick = ref(0);
let unsub: null | (() => void) = null;
onMounted(() => {
  unsub = events.on('chat.changed', () => {
    tick.value++;
  });
});
onBeforeUnmount(() => unsub?.());

const sessions = computed(() => (tick.value, chat.listSessions()));
const active = computed(() => (tick.value, chat.getActiveSession()));

const selectedId = ref(active.value?.id ?? null);

function select(id: string) {
  chat.setActiveSession(id);
  selectedId.value = id;

  const c = characters.getActive();
  if (c) {
    bindings.bindCharacterToChat(c.id, id);
  }
}

function newChat() {
  const s = chat.createSession('New chat');
  selectedId.value = s.id;

  const c = characters.getActive();
  if (c) {
    bindings.bindCharacterToChat(c.id, s.id);
  }
}

const renamingSessionId = ref(null as string | null);
const renameDraft = ref('');
function startRenameSession() {
  if (!active.value) return;
  renamingSessionId.value = active.value.id;
  renameDraft.value = active.value.title;
}
function commitRenameSession() {
  if (!renamingSessionId.value) return;
  chat.renameSession(renamingSessionId.value, renameDraft.value.trim() || 'Chat');
  renamingSessionId.value = null;
}

const input = ref('');
const inputTokens = ref(null as number | null);
const tokenizer = ref(tokens.getTokenizer());
let tokenTimer: number | null = null;

function scheduleTokenCount() {
  if (tokenTimer) window.clearTimeout(tokenTimer);
  tokenTimer = window.setTimeout(async () => {
    inputTokens.value = await tokens.countText(input.value);
  }, 150);
}

async function send() {
  const rawText = input.value;
  const text = rawText.trim();
  if (!text) return;
  input.value = '';
  inputTokens.value = null;
  const handled = await slash.tryHandle(text);
  if (handled?.type === 'handled') {
    // no-op for now; could surface toasts later
    return;
  }
  await generation.generateIntoActive({ userText: text });
}

function clickQuickReply(text: string) {
  input.value = text;
  scheduleTokenCount();
}

async function runQuickReply(b: { text: string; commandId?: string | null }) {
  if (b.commandId) {
    try {
      await commands.execute(b.commandId, {});
    } catch {
      // ignore for now
    }
    return;
  }
  clickQuickReply(String(b.text ?? ''));
}

const editingMessageId = ref(null as string | null);
const editDraft = ref('');
function startEditMessage(id: string, content: string) {
  editingMessageId.value = id;
  editDraft.value = content;
}
function commitEditMessage() {
  const s = active.value;
  if (!s || !editingMessageId.value) return;
  chat.editMessage(s.id, editingMessageId.value, { content: editDraft.value });
  editingMessageId.value = null;
}

function deleteMessage(id: string) {
  const s = active.value;
  if (!s) return;
  chat.deleteMessage(s.id, id);
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text);
}

function swipePrev(id: string) {
  const s = active.value;
  if (!s) return;
  chat.swipePrev(s.id, id);
}

function swipeNext(id: string) {
  const s = active.value;
  if (!s) return;
  chat.swipeNext(s.id, id);
}
</script>

<template>
  <section class="panel">
    <header class="panel__header">
      <h2 class="panel__title">Chat</h2>
      <button class="btn" type="button" @click="newChat">New</button>
    </header>

    <div class="grid">
      <aside class="sidebar">
        <div class="sidebar__title">Sessions</div>
        <button
          v-for="s in sessions"
          :key="s.id"
          class="session"
          :class="{ 'session--active': s.id === (selectedId ?? active?.id) }"
          type="button"
          @click="select(s.id)"
        >
          <div class="session__name">{{ s.title }}</div>
          <div class="session__meta">{{ s.messages.length }} msgs</div>
        </button>
      </aside>

      <main class="thread">
        <div v-if="!active" class="muted">No active session</div>
        <template v-else>
          <div class="thread__title">
            <template v-if="renamingSessionId === active.id">
              <input v-model="renameDraft" class="thread__rename" type="text" @keydown.enter.prevent="commitRenameSession" @blur="commitRenameSession" />
            </template>
            <template v-else>
              <span>{{ active.title }}</span>
              <button class="link" type="button" @click="startRenameSession">Rename</button>
              <button class="link link--danger" type="button" @click="chat.deleteSession(active.id)">Delete</button>
              <button class="link" type="button" @click="chat.clearSession(active.id)">Clear</button>
              <button class="link" type="button" @click="generation.regenerateLast()">Regenerate</button>
              <button class="link" type="button" @click="generation.continueFromLast()">Continue</button>
            </template>
          </div>
          <div class="messages">
            <div v-for="m in active.messages" :key="m.id" class="msg">
              <div class="msg__role">
                {{ m.role }}
                <span v-if="m.status === 'streaming'" class="pill">streaming</span>
                <span v-else-if="m.status === 'error'" class="pill pill--danger">error</span>
                <span v-else-if="m.status === 'aborted'" class="pill pill--danger">aborted</span>
              </div>
              <div class="msg__content">
                <template v-if="editingMessageId === m.id">
                  <textarea v-model="editDraft" class="textarea" rows="3" @keydown.enter.meta.prevent="commitEditMessage" />
                  <div class="msg__tools">
                    <button class="tool" type="button" @click="commitEditMessage">Save</button>
                    <button class="tool" type="button" @click="editingMessageId = null">Cancel</button>
                  </div>
                </template>
                <template v-else>
                  {{ m.selectedSwipeIndex != null && Array.isArray(m.swipes) && m.swipes[m.selectedSwipeIndex] != null ? m.swipes[m.selectedSwipeIndex] : m.content }}
                  <details v-if="m.reasoning && m.reasoning.trim()" class="reasoning">
                    <summary>Reasoning</summary>
                    <pre class="reasoning__pre">{{ formatReasoning(m.reasoning) }}</pre>
                  </details>
                  <div class="msg__tools">
                    <button class="tool" type="button" @click="copy(m.content)">Copy</button>
                    <button class="tool" type="button" @click="startEditMessage(m.id, m.content)">Edit</button>
                    <button class="tool tool--danger" type="button" @click="deleteMessage(m.id)">Delete</button>
                    <template v-if="m.role === 'assistant' && Array.isArray(m.swipes) && m.swipes.length">
                      <button class="tool" type="button" @click="swipePrev(m.id)">◀</button>
                      <button class="tool" type="button" @click="swipeNext(m.id)">▶</button>
                      <span class="muted mono">{{ (m.selectedSwipeIndex ?? 0) + 1 }}/{{ m.swipes.length + 1 }}</span>
                    </template>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <div class="composer">
            <div class="composer__stack">
              <input v-model="input" class="composer__input" type="text" placeholder="Type a message..." @input="scheduleTokenCount" @keydown.enter.prevent="send" />
              <div class="composer__hint">
                <span v-if="inputTokens != null" class="mono">{{ inputTokens }}</span>
                <span v-else class="muted">—</span>
                <span class="muted">tokens</span>
                <select
                  class="composer__select"
                  :value="tokenizer"
                  @change="
                    tokenizer = (($event.target as HTMLSelectElement).value as any);
                    tokens.setTokenizer(tokenizer as any);
                    scheduleTokenCount();
                  "
                >
                  <option value="openai">openai</option>
                  <option value="llama">llama</option>
                </select>
              </div>
            </div>
            <button class="btn" type="button" :disabled="generation.isGenerating() || !input.trim()" @click="send">Send</button>
            <button class="btn btn--danger" type="button" :disabled="!generation.isGenerating()" @click="generation.abort()">Stop</button>
          </div>

          <div class="qr">
            <button v-for="b in quickReply.listButtons()" :key="b.id" class="qr__btn" type="button" @click="runQuickReply(b)">
              {{ b.label }}
            </button>
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
.panel__title {
  margin: 0;
  font-size: 18px;
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
.grid {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 12px;
}
.sidebar {
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
}
.sidebar__title {
  font-size: 12px;
  color: #c7c7c7;
  margin-bottom: 8px;
}
.session {
  width: 100%;
  text-align: left;
  border: 1px solid #222;
  background: #0f0f0f;
  color: inherit;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  margin-bottom: 8px;
}
.session--active {
  border-color: #3a3a3a;
  background: #141414;
}
.session__name {
  font-weight: 600;
}
.session__meta {
  font-size: 12px;
  color: #a3a3a3;
}
.thread {
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
}
.thread__title {
  font-weight: 700;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.thread__rename {
  width: 100%;
  background: #121212;
  color: #f5f5f5;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 6px 10px;
}
.link {
  background: transparent;
  border: none;
  color: #c7c7c7;
  cursor: pointer;
  font-size: 12px;
}
.link--danger {
  color: #ffb4b4;
}
.pill {
  margin-left: 8px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid #2a2a2a;
  color: #a3a3a3;
}
.pill--danger {
  border-color: #512020;
  color: #ffb4b4;
}
.msg__tools {
  margin-top: 6px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.reasoning {
  margin-top: 8px;
  border: 1px solid #222;
  border-radius: 10px;
  padding: 8px 10px;
  background: #0b0b0b;
}
.reasoning__pre {
  margin: 8px 0 0;
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
  color: #c7c7c7;
}
.tool {
  background: #101010;
  color: #f5f5f5;
  border: 1px solid #222;
  border-radius: 999px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
}
.tool--danger {
  border-color: #512020;
  background: #241111;
}
.messages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.msg {
  border: 1px solid #222;
  border-radius: 10px;
  padding: 8px 10px;
  background: #0f0f0f;
}
.msg__role {
  font-size: 12px;
  color: #a3a3a3;
  margin-bottom: 4px;
}
.muted {
  color: #a3a3a3;
}
.composer {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
}
.composer__stack {
  display: grid;
  grid-template-rows: auto auto;
  gap: 6px;
}
.composer__hint {
  display: flex;
  gap: 6px;
  align-items: baseline;
  font-size: 12px;
}
.composer__select {
  margin-left: auto;
  background: #121212;
  color: #f5f5f5;
  border: 1px solid #2a2a2a;
  border-radius: 999px;
  padding: 2px 8px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
.composer__input {
  width: 100%;
  background: #121212;
  color: #f5f5f5;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 8px 10px;
}
.btn--danger {
  border-color: #512020;
  background: #241111;
}
.qr {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.qr__btn {
  background: #101010;
  color: #f5f5f5;
  border: 1px solid #222;
  border-radius: 999px;
  padding: 6px 10px;
  cursor: pointer;
}
</style>

