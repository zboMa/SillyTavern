import type { ApiClient } from '../../core/http/ApiClient';
import type { ChatCapability } from './chat';
import type { ConnectionsCapability } from './connections';
import type { WorldInfoCapability } from './worldinfo';
import type { CharactersCapability } from './characters';
import type { PromptPipelineCapability } from './promptPipeline';
import type { PresetsCapability } from './presets';

export type GenerationRequest = {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  chat_completion_source: string;
  model: string;
};

export type GenerationCapability = {
  isGenerating: () => boolean;
  abort: () => void;
  generateIntoActive: (opts: { userText: string }) => Promise<void>;
  regenerateLast: () => Promise<void>;
  regenerateFrom: (messageId: string) => Promise<void>;
  continueFromLast: () => Promise<void>;
};

export function createGeneration(
  api: ApiClient,
  chat: ChatCapability,
  connections?: ConnectionsCapability,
  worldinfo?: WorldInfoCapability,
  characters?: CharactersCapability,
  promptPipeline?: PromptPipelineCapability,
  presets?: PresetsCapability,
): GenerationCapability {
  let abortController: AbortController | null = null;

  function isGenerating() {
    return abortController != null;
  }

  function abort() {
    abortController?.abort();
    abortController = null;
  }

  async function generateIntoActive(opts: { userText: string }) {
    const session = chat.getActiveSession();
    if (!session) throw new Error('No active chat session');

    const userText = promptPipeline?.applyUserInput(opts.userText) ?? opts.userText;
    const userMsgId = chat.appendUserMessage(session.id, userText);
    const assistantMsgId = chat.startAssistantMessage(session.id);

    abortController = new AbortController();

    try {
      const conn = connections?.getActive();
      const apiId = conn?.chatCompletionSource ?? 'openai';

      const baseMessages = session.messages
        .filter((m) => m.id !== assistantMsgId) // exclude placeholder
        .map((m) => ({ role: m.role, content: m.content }));

      // WorldInfo engine expects message list; we keep this for future WI parity integration.
      const messagesForWi = baseMessages.map((m) => m.content);
      const loreText = promptPipeline?.buildSystemPrompt({ messages: messagesForWi, chatSessionId: session.id }) ?? '';

      // Preset auto-select (original behavior): if there is a preset with the same name as the active character/group, select it.
      const activeCharName = characters?.getActive?.()?.name ?? '';
      if (activeCharName && presets?.autoSelectByName) {
        presets.autoSelectByName(apiId, activeCharName);
      }
      const preset = presets?.getActive ? presets.getActive(apiId) : null;

      const messages = loreText
        ? [{ role: 'system' as const, content: loreText }, ...baseMessages]
        : baseMessages;

      const payload: any = {
        stream: true,
        chat_completion_source: apiId,
        model: conn?.model ?? 'gpt-3.5-turbo',
        reverse_proxy: conn?.reverseProxy ?? undefined,
        proxy_password: conn?.proxyPassword ?? undefined,
        include_reasoning: conn?.includeReasoning ?? undefined,
        logprobs: conn?.logprobs ?? undefined,
        temperature: preset?.temperature ?? undefined,
        top_p: preset?.top_p ?? undefined,
        max_tokens: preset?.max_tokens ?? undefined,
        presence_penalty: (preset as any)?.presence_penalty ?? undefined,
        frequency_penalty: (preset as any)?.frequency_penalty ?? undefined,
        seed: (preset as any)?.seed ?? undefined,
        stop: Array.isArray((preset as any)?.stop) ? (preset as any).stop : undefined,
        messages,
      };

      let reasoning = '';
      const toolCalls: any[] = [];

      for await (const data of api.postSse('/api/backends/chat-completions/generate', payload, { signal: abortController.signal })) {
        if (data === '[DONE]') break;
        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }

        const choice = parsed?.choices?.[0];
        const choiceIndex = typeof choice?.index === 'number' ? choice.index : 0;

        const delta = choice?.delta?.content;
        if (typeof delta === 'string' && delta.length) {
          chat.appendAssistantDelta(session.id, assistantMsgId, delta, choiceIndex);
        }

        const deltaReasoning = choice?.delta?.reasoning ?? choice?.delta?.reasoning_content ?? choice?.delta?.thoughts;
        if (typeof deltaReasoning === 'string' && deltaReasoning.length) {
          reasoning += deltaReasoning;
        }

        const deltaToolCalls = choice?.delta?.tool_calls;
        if (Array.isArray(deltaToolCalls) && deltaToolCalls.length) {
          toolCalls.push(...deltaToolCalls);
        }
      }
      chat.finishAssistantMessage(session.id, assistantMsgId, { ok: true, reasoning, toolCalls });
    } catch (e: any) {
      const aborted = abortController?.signal.aborted;
      chat.finishAssistantMessage(session.id, assistantMsgId, {
        ok: false,
        aborted,
        error: aborted ? 'aborted' : String(e?.message ?? e),
      });
      if (!aborted) throw e;
    } finally {
      abortController = null;
    }
  }

  async function regenerateLast() {
    const session = chat.getActiveSession();
    if (!session) throw new Error('No active chat session');
    const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    await generateIntoActive({ userText: lastUser.content });
  }

  async function regenerateFrom(messageId: string) {
    const session = chat.getActiveSession();
    if (!session) throw new Error('No active chat session');
    const idx = session.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const before = session.messages.slice(0, idx + 1);
    // keep until that message, then regenerate based on last user content
    const lastUser = [...before].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    // naive truncate
    chat.editMessage(session.id, session.id as any, {} as any);
    (session.messages as any) = before; // best-effort for now
    await generateIntoActive({ userText: lastUser.content });
  }

  async function continueFromLast() {
    // minimal: send empty user input isn't allowed by backend; emulate with \"Continue.\".
    await generateIntoActive({ userText: 'Continue.' });
  }

  return { isGenerating, abort, generateIntoActive, regenerateLast, regenerateFrom, continueFromLast };
}

