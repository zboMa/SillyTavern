import type { ApiClient } from '../../core/http/ApiClient';

export type ChatBackupInfo = {
  file_name: string;
  file_size?: number;
  chat_id?: string;
  character_name?: string;
  last_message_timestamp?: number;
  message_count?: number;
};

export type ChatFilesCapability = {
  listBackups: () => Promise<ChatBackupInfo[]>;
  deleteBackup: (name: string) => Promise<void>;
  downloadBackup: (name: string) => Promise<Blob>;
};

export function createChatFiles(api: ApiClient): ChatFilesCapability {
  async function listBackups() {
    return await api.postJson<ChatBackupInfo[]>('/api/backups/chat/get', {});
  }

  async function deleteBackup(name: string) {
    await api.postJson('/api/backups/chat/delete', { name });
  }

  async function downloadBackup(name: string) {
    // ApiClient doesn't have blob helper; do raw fetch with CSRF cookie already set in browser
    const res = await fetch('/api/backups/chat/download', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    return await res.blob();
  }

  return { listBackups, deleteBackup, downloadBackup };
}

