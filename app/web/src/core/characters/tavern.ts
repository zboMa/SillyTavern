import type { CharacterCard } from './model';
import { normalizeCharacter } from './format';

function decodeBase64ToString(b64: string): string {
  // atob handles base64 in browser; tolerate whitespace/newlines
  const clean = b64.replace(/\s+/g, '');
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(clean), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join(''),
  );
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function ascii(bytes: Uint8Array, offset: number, len: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + len));
}

function readZeroTerminatedLatin1(bytes: Uint8Array, start: number, end: number): { text: string; next: number } {
  let i = start;
  while (i < end && bytes[i] !== 0) i++;
  const text = String.fromCharCode(...bytes.slice(start, i));
  return { text, next: Math.min(i + 1, end) };
}

function readLatin1(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

export type PngTextChunk = { type: 'tEXt' | 'iTXt'; key: string; value: string };

export function extractPngTextChunks(pngBytes: Uint8Array): PngTextChunk[] {
  // Minimal PNG chunk walker. Ignores CRC validation on purpose.
  const out: PngTextChunk[] = [];
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < sig.length; i++) {
    if (pngBytes[i] !== sig[i]) return out;
  }

  let off = 8;
  while (off + 8 <= pngBytes.length) {
    const length = readU32BE(pngBytes, off);
    const type = ascii(pngBytes, off + 4, 4);
    const dataStart = off + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > pngBytes.length) break;

    if (type === 'tEXt') {
      // keyword\0text (Latin-1)
      const { text: key, next } = readZeroTerminatedLatin1(pngBytes, dataStart, dataEnd);
      const value = readLatin1(pngBytes, next, dataEnd);
      out.push({ type: 'tEXt', key, value });
    } else if (type === 'iTXt') {
      // keyword\0compressionFlag\0compressionMethod\0languageTag\0translatedKeyword\0text (utf-8, maybe compressed)
      const { text: key, next: afterKey } = readZeroTerminatedLatin1(pngBytes, dataStart, dataEnd);
      const compressionFlag = pngBytes[afterKey];
      const compressionMethod = pngBytes[afterKey + 1];
      // we only support uncompressed utf-8 text for now
      let p = afterKey + 2;
      const a = readZeroTerminatedLatin1(pngBytes, p, dataEnd);
      p = a.next; // languageTag
      const b = readZeroTerminatedLatin1(pngBytes, p, dataEnd);
      p = b.next; // translatedKeyword
      if (compressionFlag === 0 && compressionMethod === 0) {
        const valueBytes = pngBytes.slice(p, dataEnd);
        const value = new TextDecoder('utf-8').decode(valueBytes);
        out.push({ type: 'iTXt', key, value });
      }
    }

    if (type === 'IEND') break;
    off = dataEnd + 4; // skip CRC
  }

  return out;
}

export function importCharacterFromTavernJson(data: unknown): CharacterCard | null {
  // TavernAI v2 JSON commonly shaped as { spec, spec_version, data: {...} }
  const d = data as any;
  const payload = d?.data && typeof d.data === 'object' ? d.data : null;
  if (!payload) return null;

  const name = payload.name ?? payload.char_name ?? d.name;
  if (!name) return null;

  const ext = payload.extensions && typeof payload.extensions === 'object' ? payload.extensions : {};
  const depthPromptRaw = ext?.depth_prompt && typeof ext.depth_prompt === 'object' ? ext.depth_prompt : null;

  const card = normalizeCharacter({
    name,
    description: payload.description ?? payload.char_persona ?? payload.persona ?? '',
    personality: payload.personality ?? '',
    scenario: payload.scenario ?? '',
    firstMessage: payload.first_mes ?? payload.firstMessage ?? '',
    exampleMessages: payload.mes_example ?? payload.exampleMessages ?? '',
    creatorNotes: payload.creator_notes ?? payload.creatorNotes ?? '',
    systemPrompt: payload.system_prompt ?? payload.systemPrompt ?? '',
    postHistoryInstructions: payload.post_history_instructions ?? payload.postHistoryInstructions ?? '',
    creator: payload.creator ?? '',
    alternateGreetings: Array.isArray(payload.alternate_greetings) ? payload.alternate_greetings : [],
    characterBook: payload.character_book && typeof payload.character_book === 'object' ? payload.character_book : null,
    talkativeness: typeof ext?.talkativeness === 'number' ? ext.talkativeness : 0,
    world: typeof ext?.world === 'string' ? ext.world : '',
    depthPrompt: depthPromptRaw
      ? {
          depth: Number(depthPromptRaw.depth ?? 0),
          prompt: String(depthPromptRaw.prompt ?? ''),
          role: (['system', 'user', 'assistant'].includes(String(depthPromptRaw.role)) ? String(depthPromptRaw.role) : 'system') as any,
        }
      : null,
    regexScripts: Array.isArray(ext?.regex_scripts) ? ext.regex_scripts : [],
    // tags may exist as array of strings
    tags: Array.isArray(payload.tags) ? payload.tags.map((t: any) => ({ id: String(t), name: String(t) })) : [],
    avatarUrl: null,
    favorite: Boolean(ext?.fav ?? false),
  });

  return card;
}

export async function importCharacterFromPngFile(file: File): Promise<CharacterCard | null> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunks = extractPngTextChunks(bytes);

  // SillyTavern-style: often tEXt key "chara" with base64 json
  const candidates = chunks
    .filter((c) => ['chara', 'character', 'ccv3', 'json', 'Description'].includes(c.key))
    .map((c) => c.value);

  for (const raw of candidates) {
    // try base64 json then plain json
    const attempts: string[] = [];
    attempts.push(raw);
    try {
      attempts.push(decodeBase64ToString(raw));
    } catch {
      // ignore
    }
    for (const t of attempts) {
      try {
        const parsed = JSON.parse(t);
        return importCharacterFromTavernJson(parsed) ?? normalizeCharacter(parsed as any);
      } catch {
        // ignore and keep trying
      }
    }
  }

  return null;
}

function encodeStringToBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function u32be(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      const m = -(c & 1);
      c = (c >>> 1) ^ (0xedb88320 & m);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const len = u32be(data.length);
  const crc = u32be(crc32(concatBytes([typeBytes, data])));
  return concatBytes([len, typeBytes, data, crc]);
}

function isPng(bytes: Uint8Array): boolean {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

function stripTextKeys(pngBytes: Uint8Array, keys: string[]): Uint8Array {
  if (!isPng(pngBytes)) return pngBytes;
  const keySet = new Set(keys);
  const sig = pngBytes.slice(0, 8);
  const outParts: Uint8Array[] = [sig];

  let off = 8;
  while (off + 8 <= pngBytes.length) {
    const length = readU32BE(pngBytes, off);
    const type = ascii(pngBytes, off + 4, 4);
    const dataStart = off + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > pngBytes.length) break;

    const fullChunk = pngBytes.slice(off, dataEnd + 4);
    let keep = true;
    if (type === 'tEXt') {
      const { text: key } = readZeroTerminatedLatin1(pngBytes, dataStart, dataEnd);
      if (keySet.has(key)) keep = false;
    }
    if (keep) outParts.push(fullChunk);
    if (type === 'IEND') break;
    off = dataEnd + 4;
  }

  return concatBytes(outParts);
}

function insertAfterIHDR(pngBytes: Uint8Array, chunkBytes: Uint8Array): Uint8Array {
  // signature (8) + IHDR chunk (length 4 + type 4 + data 13 + crc 4) => ends at 8 + 25 = 33
  // but we compute using length from file for robustness
  let off = 8;
  if (!isPng(pngBytes)) return pngBytes;
  const length = readU32BE(pngBytes, off);
  const type = ascii(pngBytes, off + 4, 4);
  if (type !== 'IHDR') return pngBytes;
  const ihdrEnd = off + 8 + length + 4;
  return concatBytes([pngBytes.slice(0, ihdrEnd), chunkBytes, pngBytes.slice(ihdrEnd)]);
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const m = /^data:(.+?);base64,(.*)$/i.exec(dataUrl);
  if (!m) return null;
  const b64 = m[2];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// 1x1 transparent PNG
const FALLBACK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/abm5n8AAAAASUVORK5CYII=';

export function characterToTavernV2Json(card: CharacterCard): object {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: card.name,
      description: card.description,
      personality: card.personality,
      scenario: card.scenario,
      first_mes: card.firstMessage,
      mes_example: card.exampleMessages,
      creator_notes: card.creatorNotes,
      creator: (card as any).creator ?? '',
      system_prompt: card.systemPrompt,
      post_history_instructions: (card as any).postHistoryInstructions ?? '',
      alternate_greetings: Array.isArray((card as any).alternateGreetings) ? (card as any).alternateGreetings : [],
      character_book: (card as any).characterBook ?? null,
      tags: card.tags.map((t) => t.name),
      extensions: {
        talkativeness: (card as any).talkativeness ?? 0,
        fav: Boolean((card as any).favorite ?? false),
        world: (card as any).world ?? '',
        depth_prompt: (card as any).depthPrompt ?? null,
        regex_scripts: (card as any).regexScripts ?? [],
      },
    },
  };
}

export async function exportCharacterToPngBlob(card: CharacterCard): Promise<Blob> {
  const tavern = characterToTavernV2Json(card);
  const json = JSON.stringify(tavern);
  const b64 = encodeStringToBase64Utf8(json);
  const keyword = 'chara';
  const data = new TextEncoder().encode(`${keyword}\0${b64}`);
  const textChunk = makeChunk('tEXt', data);

  let baseBytes: Uint8Array | null = null;
  if (typeof card.avatarUrl === 'string' && card.avatarUrl.startsWith('data:image/png;base64,')) {
    baseBytes = dataUrlToBytes(card.avatarUrl);
  }
  if (!baseBytes) {
    baseBytes = dataUrlToBytes(`data:image/png;base64,${FALLBACK_PNG_BASE64}`);
  }
  if (!baseBytes) {
    throw new Error('Failed to build base PNG');
  }

  const stripped = stripTextKeys(baseBytes, ['chara']);
  const withText = insertAfterIHDR(stripped, textChunk);
  return new Blob([withText], { type: 'image/png' });
}

