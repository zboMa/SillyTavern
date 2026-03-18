import type { ApiClient } from '../../core/http/ApiClient';
import type { ConnectionsCapability } from './connections';

export type TokensCapability = {
  countText: (text: string) => Promise<number>;
  setTokenizer: (id: 'openai' | 'llama') => void;
  getTokenizer: () => 'openai' | 'llama';
};

export function createTokens(api: ApiClient, connections?: ConnectionsCapability): TokensCapability {
  let tokenizer: 'openai' | 'llama' = 'openai';

  async function countText(text: string): Promise<number> {
    const t = text ?? '';
    if (!t.trim()) return 0;
    const conn = connections?.getActive();
    const model = conn?.model || 'gpt-3.5-turbo';

    try {
      const path = tokenizer === 'llama' ? '/api/tokenizers/llama/encode' : '/api/tokenizers/openai/encode';
      // Server returns token ids array for /encode
      const ids = (await api.postJson<number[]>(path, { text: t, model })) as any;
      if (Array.isArray(ids)) return ids.length;
    } catch {
      // fall back
    }
    return Math.ceil(t.length / 3.35);
  }

  function setTokenizer(id: 'openai' | 'llama') {
    tokenizer = id;
  }
  function getTokenizer() {
    return tokenizer;
  }

  return { countText, setTokenizer, getTokenizer };
}

