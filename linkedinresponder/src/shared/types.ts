export interface BotConfig {
  openaiApiKey: string;
  groqApiKey: string;
  resendApiKey: string;
  model: string;
  groqModel: string;
  useGroq: boolean;
  systemPrompt: string;
  minDelay: number;
  maxDelay: number;
  typingSpeed: number;
  strictWorkingHours: boolean;
  leadNotificationEmail: string;
}

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
  type: 'GET_STATUS' | 'START_BOT' | 'STOP_BOT';
  config?: {
    nChats: number;
    model: string;
    useGroq: boolean;
    groqModel: string;
    strictHours: boolean;
  };
}

// ✅ Profile information structure
export interface LeadProfile {
  headline: string;
  jobTitle: string;
  company: string;
  location: string;
  connectionDegree: string;
  lastScraped: number;
}

// ✅ Message entry structure
export interface MessageEntry {
  speaker: string;
  content: string;
  timestamp: number;
  type: 'sent' | 'received';
}

// ✅ Conversation history structure
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
