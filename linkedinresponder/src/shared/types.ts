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
  tokensUsed: number;  // ✅ NEW: Track token usage
  currentModel: string;  // ✅ NEW: Track active model
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
