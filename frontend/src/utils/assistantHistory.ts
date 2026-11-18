// Saved Dashboard Assistant conversation, so it survives page changes,
// reloads and other browser tabs. Kept per user and cleared on logout.

const PREFIX = 'jf_assistant_';
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // start fresh after 12 idle hours
const MAX_SAVED = 40;

export interface SavedMsg { role: 'user' | 'assistant'; content: string; error?: boolean }

export const assistantHistoryKey = (userId: string) => PREFIX + userId;

export function loadAssistantHistory(userId: string): SavedMsg[] {
  try {
    const raw = localStorage.getItem(assistantHistoryKey(userId));
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data?.messages) || Date.now() - Number(data.updatedAt || 0) > MAX_AGE_MS) return [];
    return data.messages.filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
  } catch {
    return [];
  }
}

export function saveAssistantHistory(userId: string, messages: SavedMsg[]): void {
  try {
    // Skip no-op writes so two open tabs don't keep re-saving each other's updates.
    if (JSON.stringify(messages.slice(-MAX_SAVED)) === JSON.stringify(loadAssistantHistory(userId))) return;
    if (!messages.length) localStorage.removeItem(assistantHistoryKey(userId));
    else localStorage.setItem(assistantHistoryKey(userId), JSON.stringify({ updatedAt: Date.now(), messages: messages.slice(-MAX_SAVED) }));
  } catch {}
}

export function clearAllAssistantHistory(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {}
}
