import { ConversationHistory, MessageEntry, StoredConversations, LeadProfile } from "./types";

const STORAGE_KEY = "conversation_histories";
const MAX_MESSAGES_PER_CONVO = 500;
const SYNC_COOLDOWN = 60000; // 1 minute
const PROFILE_REFRESH_INTERVAL = 86400000; // 24 hours

export function generateLeadId(leadName: string, profileUrl: string): string {
  const combined = `${leadName}_${profileUrl}`;
  return btoa(combined).substring(0, 32);
}

export async function loadAllConversations(): Promise<StoredConversations> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      resolve(result[STORAGE_KEY] || {});
    });
  });
}

export async function loadConversation(leadId: string): Promise<ConversationHistory | null> {
  const allConvos = await loadAllConversations();
  return allConvos[leadId] || null;
}

export async function saveConversation(conversation: ConversationHistory): Promise<void> {
  const allConvos = await loadAllConversations();
  
  if (conversation.messages.length > MAX_MESSAGES_PER_CONVO) {
    conversation.messages = conversation.messages.slice(-MAX_MESSAGES_PER_CONVO);
  }
  
  allConvos[conversation.leadId] = conversation;
  
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: allConvos }, () => {
      resolve();
    });
  });
}

export function shouldResync(conversation: ConversationHistory | null): boolean {
  if (!conversation) return true;
  const timeSinceLastSync = Date.now() - conversation.metadata.lastSyncedAt;
  return timeSinceLastSync > SYNC_COOLDOWN;
}

export function shouldRefreshProfile(profile: LeadProfile | null): boolean {
  if (!profile) return true;
  const timeSinceLastScrape = Date.now() - profile.lastScraped;
  return timeSinceLastScrape > PROFILE_REFRESH_INTERVAL;
}

export async function deleteConversation(leadId: string): Promise<void> {
  const allConvos = await loadAllConversations();
  delete allConvos[leadId];
  
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: allConvos }, () => {
      resolve();
    });
  });
}

export async function getStorageStats(): Promise<{ count: number; totalMessages: number }> {
  const allConvos = await loadAllConversations();
  const count = Object.keys(allConvos).length;
  const totalMessages = Object.values(allConvos).reduce(
    (sum, convo) => sum + convo.messages.length, 
    0
  );
  return { count, totalMessages };
}
