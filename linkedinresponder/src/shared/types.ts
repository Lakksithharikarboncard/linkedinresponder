// linkedinresponder/src/shared/types.ts
//
// Core types for bot runtime state and data structures.
// For storage schema, see BotSettings in settings.ts.

export interface BotStats {
  chatsProcessed: number;
  repliesSent: number;
  leadsFound: number;
  startTime: number | null;
  tokensUsed: number;
  currentModel: string;
}

export interface BotStatus {
  running: boolean;
  stats: BotStats;
  logs: BotLogEntry[];
  currentChat?: string;
}

export interface BotLogEntry {
  time: number;
  actor: string;
  message: string;
  type: 'INFO' | 'ACTION' | 'SUCCESS' | 'ERROR' | 'WARNING' | 'LEAD';
}


export interface BotCommand {
  type: 
    | 'GET_STATUS' 
    | 'START_BOT' 
    | 'STOP_BOT'
    | 'PAUSE_BOT'      // ✅ Added
    | 'RESUME_BOT'     // ✅ Added
    | 'APPROVE_REPLY'  // ✅ Added
    | 'REJECT_REPLY'   // ✅ Added
    | 'CHECKUNREAD'    // ✅ Added
    | 'PINGTEST';      // ✅ Added
  config?: {
    nChats: number;
    replyPreviewEnabled: boolean;
    blacklist: string[];
  };
  // For APPROVE_REPLY/REJECT_REPLY
  reply?: string;
  leadName?: string;
}


// Profile information structure
export interface LeadProfile {
  headline: string;
  jobTitle: string;
  company: string;
  location: string;
  connectionDegree: string;
  lastScraped: number;
}

// Message entry structure
export interface MessageEntry {
  speaker: string;
  content: string;
  timestamp: number;
  type: 'sent' | 'received';
}

// Conversation history structure
export interface ConversationHistory {
  leadId: string;
  leadName: string;
  profileUrl: string;
  profile: LeadProfile | null;
  messages: MessageEntry[];
  metadata: {
    firstContact: number;
    lastActivity: number;
    lastMessageFrom: 'lead' | 'me';
    totalMessages: number;
    lastSyncedAt: number;
  };
}

export interface StoredConversations {
  [leadId: string]: ConversationHistory;
}
