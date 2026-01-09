// src/content/content.ts

import {
  BotCommand,
  BotLogEntry,
  BotStats,
  BotStatus,
  MessageEntry,
  ConversationHistory,
} from "../shared/types";
import {
  checkPositiveLead,
  sendLeadWebhook,
  shouldEngageAfterClose,
  LeadWebhookPayload,
} from "../shared/sendEmail";
import {
  generateLeadId,
  loadConversation,
  saveConversation,
  shouldResync,
} from "../shared/conversationStorage";
import {
  scrapeLeadProfile,
  formatProfileForDisplay,
  formatProfileForAI,
} from "../shared/profileScraper";
import {
  shouldDoubleText,
  generateDoubleText,
  calculateDoubleTextDelay,
} from "../shared/doubleTextHandler";
import { getBotSettings, AIProvider } from "../shared/settings";

type ContentCommand =
  | BotCommand
  | { type: "PINGTEST" }
  | { type: "CHECKUNREAD" }
  | { type: "PAUSEBOT" }
  | { type: "RESUMEBOT" }
  | { type: "APPROVEREPLY"; reply: string; leadName: string }
  | { type: "REJECTREPLY"; leadName: string };

// --- STATE VARIABLES ---
let botRunning = false;
let botPaused = false;
let botLoopTimeout: number | null = null;
let stats: BotStats = {
  chatsProcessed: 0,
  repliesSent: 0,
  leadsFound: 0,
  startTime: null,
  tokensUsed: 0,
  currentModel: "",
};
let logs: BotLogEntry[] = [];
let replyPreviewEnabled = false;
let pendingReplyResolve: ((approved: { approved: boolean; reply: string }) => void) | null = null;
let blacklist: string[] = [];

// --- CONSTANTS ---
const HEADLINE_BLACKLIST = ["student", "intern", "seeking", "open to work", "looking for", "hiring"];
const CLOSE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const MY_CLOSE_PATTERNS = [
  "no overlap",
  "not a fit",
  "reach out if",
  "feel free to reach out",
  "thanks for letting me know",
  "happy to stay connected",
  "best of luck",
  "good luck with",
  "wishing you",
  "take care",
  "all the best",
  "not what you're looking for",
  "doesn't seem like a match",
  "maybe in the future",
  "keep in touch",
];

const POSITIVE_SCHEDULING_CONTEXT = [
  "schedule",
  "reschedule",
  "next week",
  "after jan",
  "after january",
  "after the",
  "let's",
  "lets",
  "call",
  "meet",
  "demo",
  "walkthrough",
  "chat soon",
  "talk soon",
  "talk then",
  "sounds good",
  "works for me",
  "perfect",
  "great",
  "book",
  "calendar",
  "calendly",
  "outlook",
];

const SOFT_POSITIVE_PATTERNS = ["no problem", "no worries", "sure thing", "of course", "absolutely", "definitely"];

const SCHEDULING_PATTERNS = [
  "calendly.com",
  "cal.com",
  "outlook.office.com/book",
  "hubspot.com/meetings",
  "savvycal.com",
  "tidycal.com",
  "book a time",
  "grab time",
  "schedule a call",
  "schedule a chat",
  "book a call",
  "here's a link",
  "here is a link",
  "whenever works",
  "pick a time",
  "find a time",
];

const LEAD_CONFIRMATION_PATTERNS = [
  "sounds good",
  "sounds great",
  "perfect",
  "will do",
  "see you then",
  "looking forward",
  "look forward",
  "talk soon",
  "talk then",
  "catch you",
  "thanks for sharing",
  "thank you for sharing",
  "i'll check",
  "i will check",
  "let me check",
  "booked",
  "scheduled",
  "confirmed",
  "done",
  "great",
  "thanks",
  "awesome",
  "cool",
  "ok great",
  "okay great",
  "works for me",
];

const SHORT_PING_PATTERNS = [
  "hi",
  "hey",
  "hello",
  "hii",
  "hiii",
  "heyy",
  "heyyy",
  "yo",
  "sup",
  "morning",
  "good morning",
  "good afternoon",
  "good evening",
  "gm",
];

const RESCHEDULE_REASON_PATTERNS = [
  { pattern: "vacation", reason: "vacation" },
  { pattern: "holiday", reason: "holiday" },
  { pattern: "traveling", reason: "traveling" },
  { pattern: "travel", reason: "travel" },
  { pattern: "out of office", reason: "out of office" },
  { pattern: "out of town", reason: "out of town" },
  { pattern: "busy", reason: "busy schedule" },
  { pattern: "swamped", reason: "busy schedule" },
  { pattern: "hectic", reason: "busy schedule" },
  { pattern: "next week", reason: "timing" },
  { pattern: "after the", reason: "timing" },
  { pattern: "after jan", reason: "new year" },
  { pattern: "after january", reason: "new year" },
  { pattern: "new year", reason: "new year" },
];

// Model display names
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Groq models
  "openai/gpt-o-ss-20b": "GPT-OSS 20B",
  "openai/gpt-o-ss-120b": "GPT-OSS 120B",
  "llama-3.3-70b-versatile": "Llama 3.3 70B",
  "llama-3.1-8b-instant": "Llama 3.1 8B",
  "moonshot/ai/kimi-k2-instruct-0905": "Kimi K2",
  // OpenAI models
  "gpt-5.1": "GPT-5.1",
  "gpt-5": "GPT-5",
  "gpt-5-mini": "GPT-5 mini",
  "gpt-5-nano": "GPT-5 nano",
  "gpt-5.1-chat-latest": "GPT-5.1 Chat",
  // Routeway models
  "devstral-2512/free": "Devstral 2512",
  "kimi-k2-0905/free": "Kimi K2",
  "minimax-m2/free": "Minimax M2",
  "deepseek-r1t2-chimera/free": "DeepSeek R1T2",
};

// --- HELPERS ---
function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

async function fetchWithBackoff(
  fn: () => Promise<Response>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fn();
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const backoffDelay = baseDelayMs * 2 ** attempt + Math.random() * 400;
      await delay(backoffDelay);
      attempt++;
      continue;
    }
    return res;
  }
}

function addLog(type: "INFO" | "ACTION" | "ERROR" | "SUCCESS" | "WARNING", message: string, actor: "User" | "Bot" | "System") {
  const entry: BotLogEntry = { time: Date.now(), type, message, actor };
  logs.unshift(entry);
  if (logs.length > 100) logs.pop();
  chrome.storage.local.set({ botLog: logs.slice(0, 50) });
}

function updateStats(key: keyof BotStats, value: number | string) {
  if (key === "startTime") {
    stats.startTime = value as number;
  } else if (key === "currentModel") {
    stats.currentModel = value as string;
  } else {
    (stats[key] as number) += value as number;
  }
}

function calculateTypingDelay(text: string): number {
  return 2000 + (text.split(" ").length / 300) * Math.random() * 2000;
}

function isWithinWorkingHours(startHour: number = 9, endHour: number = 18): boolean {
  const currentHour = new Date().getHours();
  return currentHour >= startHour && currentHour <= endHour;  // ✅ FIXED: Uses <=
}


async function setEditableText(input: HTMLElement, text: string) {
  input.focus();
  await delay(50);
  document.execCommand("selectAll", false);
  document.execCommand("delete", false);
  for (const char of text) {
    document.execCommand("insertText", false, char);
    await delay(Math.random() < 0.9 ? 150 + 30 * Math.random() : 50);
  }
}

async function humanScroll() {
  const pane = document.querySelector<HTMLElement>(".msg-s-message-list__content");
  if (!pane) return;
  pane.scrollBy(0, Math.random() * 80 + 20);
  await delay(300 + Math.random() * 500);
  pane.scrollBy(0, -Math.random() * 50 + 10);
  await delay(300 + Math.random() * 500);
}

async function scrollConversationList(times: number = 5) {
  const container = document.querySelector<HTMLElement>(".msg-conversations-container--inbox-shortcuts");
  if (!container) return;
  for (let i = 0; i < times; i++) {
    container.scrollBy({ top: Math.random() * 200 + 100, behavior: "smooth" });
    await delay(500 + Math.random() * 800);
    container.scrollBy({ top: -Math.random() * 50, behavior: "smooth" });
    await delay(400 + Math.random() * 500);
  }
}

// Groq key rotation state
let groqKeyIndex = 0;

function getGroqApiKey(groqApiKey: string, groqApiKey2: string): string {
  if (!groqApiKey2?.trim()) return groqApiKey;
  if (!groqApiKey?.trim()) return groqApiKey2;
  groqKeyIndex = (groqKeyIndex + 1) % 2;
  return groqKeyIndex === 0 ? groqApiKey : groqApiKey2;
}

function getApiKeyForProvider(
  provider: AIProvider,
  apiKey: string,
  groqApiKey: string,
  groqApiKey2: string,
  routewayApiKey: string
): string {
  if (provider === "groq") return getGroqApiKey(groqApiKey, groqApiKey2);
  if (provider === "routeway") return routewayApiKey;
  return apiKey;
}

function getModelForProvider(provider: AIProvider, groqModel: string, openaiModel: string, routewayModel: string): string {
  if (provider === "groq") return groqModel;
  if (provider === "routeway") return routewayModel;
  return openaiModel;
}

async function getSettings() {
  const s = await getBotSettings();
  return {
    apiKey: s.openaiApiKey,
    groqApiKey: s.groqApiKey,
    groqApiKey2: s.groqApiKey2, // Added secondary Groq key
    routewayApiKey: s.routewayApiKey, // Added Routeway key
    chatMin: s.chatMinDelay,
    chatMax: s.chatMaxDelay,
    loopMin: s.loopMinDelay,
    loopMax: s.loopMaxDelay,
    prompt: s.replyPrompt,
    leadPrompt: s.leadPrompt,
    webhookUrl: s.webhookUrl,
    startHour: s.startHour,
    endHour: s.endHour,
    replyProvider: s.replyProvider,
    leadDetectionProvider: s.leadDetectionProvider,
    groqModel: s.groqModel,
    openaiModel: s.openaiModel,
    routewayModel: s.routewayModel, // Added Routeway model
  };
}

function getLeadName(): string | null {
  const el = document.evaluate(
    "id('thread-detail-jump-target')/div/a/div/dl/dt/h2",
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  ).singleNodeValue as HTMLElement | null;
  return el?.textContent?.trim() ?? null;
}

function getLeadProfileUrl(): string {
  const profileLink = document.querySelector<HTMLAnchorElement>("a[href*='in/']");
  return profileLink?.href ?? window.location.href;
}

// Fixed: Handle LinkedIn's grouped messages
function getLastMessage(leadName: string): { fromLead: boolean; content: string } | null {
  const events = Array.from(document.querySelectorAll("li.msg-s-message-list__event"));
  let currentSender: string | null = null;
  const allMessages: Array<{ sender: string; content: string }> = [];

  for (const msgEl of events) {
    const senderEl = msgEl.querySelector("span.msg-s-message-group__name");
    const contentEl = msgEl.querySelector("p.msg-s-event-listitem__body");

    if (senderEl) currentSender = senderEl.textContent?.trim() ?? null;

    if (contentEl && currentSender) {
      const content = contentEl.textContent?.trim();
      if (content) allMessages.push({ sender: currentSender, content });
    }
  }

  if (allMessages.length === 0) return null;
  const lastMsg = allMessages[allMessages.length - 1];
  return { fromLead: lastMsg.sender.includes(leadName), content: lastMsg.content };
}

// Get recent messages from lead for AI decision
function getRecentLeadMessages(leadName: string, count: number = 5): string[] {
  const events = Array.from(document.querySelectorAll("li.msg-s-message-list__event"));
  let currentSender: string | null = null;
  const leadMessages: string[] = [];

  for (const msgEl of events) {
    const senderEl = msgEl.querySelector("span.msg-s-message-group__name");
    const contentEl = msgEl.querySelector("p.msg-s-event-listitem__body");

    if (senderEl) currentSender = senderEl.textContent?.trim() ?? null;

    if (contentEl && currentSender && currentSender.includes(leadName)) {
      const content = contentEl.textContent?.trim();
      if (content) leadMessages.push(content);
    }
  }

  return leadMessages.slice(-count);
}

async function scrollToLoadAllMessages() {
  const messagePane = document.querySelector<HTMLElement>(".msg-s-message-list__content");
  if (!messagePane) return;

  let previousHeight = 0;
  let currentHeight = messagePane.scrollHeight;
  let attempts = 0;

  addLog("INFO", "Loading full conversation history...", "System");

  while (currentHeight > previousHeight && attempts < 50) {
    previousHeight = currentHeight;
    messagePane.scrollTo({ top: 0, behavior: "smooth" });
    await delay(800 + Math.random() * 400);
    currentHeight = messagePane.scrollHeight;
    attempts++;
  }

  addLog("INFO", `Loaded ${attempts} message batches`, "System");
}

// Fixed: Handle grouped messages
async function getCompleteConversation(leadName: string): Promise<MessageEntry[]> {
  await scrollToLoadAllMessages();

  const events = Array.from(document.querySelectorAll("li.msg-s-message-list__event"));
  const messages: MessageEntry[] = [];
  let currentSender: string | null = null;

  for (const msgEl of events) {
    const senderEl = msgEl.querySelector("span.msg-s-message-group__name");
    const contentEl = msgEl.querySelector("p.msg-s-event-listitem__body");
    const timeEl = msgEl.querySelector("time");

    if (senderEl) currentSender = senderEl.textContent?.trim() ?? null;

    if (contentEl && currentSender) {
      const content = contentEl.textContent?.trim();
      let timestamp = Date.now();

      if (timeEl) {
        const dt = timeEl.getAttribute("datetime");
        if (dt) timestamp = new Date(dt).getTime();
      }

      if (content) {
        messages.push({
          speaker: currentSender,
          content,
          timestamp,
          type: currentSender.includes(leadName) ? "received" : "sent",
        });
      }
    }
  }

  return messages;
}

async function getOrCreateConversationHistory(leadName: string): Promise<ConversationHistory> {
  const profileUrl = getLeadProfileUrl();
  const leadId = generateLeadId(leadName, profileUrl);

  let existingConvo = await loadConversation(leadId);
  if (existingConvo && !shouldResync(existingConvo)) {
    addLog(
      "INFO",
      `Using cached data for ${formatProfileForDisplay(leadName, existingConvo.profile)} (${existingConvo.messages.length} msgs)`,
      "System"
    );
    return existingConvo;
  }

  addLog("INFO", `Scraping profile for ${leadName}...`, "System");
  const profileData = scrapeLeadProfile();

  addLog("INFO", `Syncing full history for ${leadName}...`, "System");
  const freshMessages = await getCompleteConversation(leadName);
  const lastMsg = freshMessages[freshMessages.length - 1];

  const conversation: ConversationHistory = {
    leadId,
    leadName,
    profileUrl,
    profile: profileData,
    messages: freshMessages,
    metadata: {
      firstContact: freshMessages[0]?.timestamp ?? Date.now(),
      lastActivity: lastMsg?.timestamp ?? Date.now(),
      lastMessageFrom: lastMsg?.type === "received" ? "lead" : "me",
      totalMessages: freshMessages.length,
      lastSyncedAt: Date.now(),
    },
  };

  await saveConversation(conversation);
  addLog(
    "SUCCESS",
    `Saved ${freshMessages.length} messages & profile for ${formatProfileForDisplay(leadName, profileData)}`,
    "System"
  );

  return conversation;
}

function containsSchedulingLink(content: string): boolean {
  const lower = content.toLowerCase();
  return SCHEDULING_PATTERNS.some((p) => lower.includes(p));
}

function isLeadConfirmation(content: string): boolean {
  const lower = content.toLowerCase().trim();
  if (lower.split(" ").length > 10) return false;
  return LEAD_CONFIRMATION_PATTERNS.some((p) => lower.includes(p));
}

function isShortPing(content: string): boolean {
  const lower = content.toLowerCase().trim();
  if (lower.split(" ").length > 3) return false;
  return SHORT_PING_PATTERNS.some((p) => lower === p || lower.startsWith(p));
}

function hasPositiveSchedulingContext(content: string): boolean {
  return POSITIVE_SCHEDULING_CONTEXT.some((p) => content.toLowerCase().includes(p));
}

function isSoftPositiveInContext(content: string): boolean {
  const lower = content.toLowerCase();
  return SOFT_POSITIVE_PATTERNS.some((p) => lower.includes(p)) && hasPositiveSchedulingContext(content);
}

function getPendingMeetingTimestamp(messages: MessageEntry[]): number | null {
  for (let i = messages.length - 1; i >= 1; i--) {
    const curr = messages[i];
    const prev = messages[i - 1];

    if (prev.type === "sent" && curr.type === "received" && containsSchedulingLink(prev.content) && isLeadConfirmation(curr.content)) {
      return curr.timestamp;
    }

    if (i >= 2) {
      const prevPrev = messages[i - 2];
      if (prevPrev.type === "received" && prev.type === "sent" && curr.type === "received") {
        const ppLower = prevPrev.content.toLowerCase();
        if (
          (ppLower.includes("schedule") || ppLower.includes("after") || ppLower.includes("next week") || ppLower.includes("vacation") || ppLower.includes("holiday")) &&
          isLeadConfirmation(curr.content)
        ) {
          return curr.timestamp;
        }
      }
    }
  }
  return null;
}

function getMyCloseTimestamp(messages: MessageEntry[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === "sent") {
      const lower = m.content.toLowerCase();
      if (hasPositiveSchedulingContext(m.content) || isSoftPositiveInContext(m.content)) continue;
      if (MY_CLOSE_PATTERNS.some((p) => lower.includes(p))) {
        return m.timestamp;
      }
    }
  }
  return null;
}

interface ConversationCloseState {
  isClosed: boolean;
  closeType: "none" | "my_close" | "pending_meeting";  // ✅ Fixed with underscores
  closeTimestamp: number | null;
  reason: string;
}


function getConversationCloseState(messages: MessageEntry[]): ConversationCloseState {
  const pendingTs = getPendingMeetingTimestamp(messages);
  if (pendingTs) {
    return { isClosed: true, closeType: "pending_meeting", closeTimestamp: pendingTs, reason: "Meeting scheduled" };
  }

  const myCloseTs = getMyCloseTimestamp(messages);
  if (myCloseTs) {
    return { isClosed: true, closeType: "my_close", closeTimestamp: myCloseTs, reason: "I closed the conversation" };
  }

  return { isClosed: false, closeType: "none", closeTimestamp: null, reason: "" };
}

// AI-based skip decision
async function shouldSkipDueToCloseState(
  closeState: ConversationCloseState,
  recentLeadMessages: string[],
  apiKey: string,
  provider: AIProvider
): Promise<{ shouldSkip: boolean; reason: string }> {
  if (!closeState.isClosed || !closeState.closeTimestamp) {
    return { shouldSkip: false, reason: "" };
  }

  const timeSinceClose = Date.now() - closeState.closeTimestamp;
  const daysSinceClose = Math.round(timeSinceClose / (1000 * 60 * 60 * 24));

  // Use AI to decide
  addLog("INFO", `Checking engagement with AI (${daysSinceClose} days since close)...`, "System");
  const result = await shouldEngageAfterClose(apiKey, recentLeadMessages, closeState.closeType, daysSinceClose, provider);

  return { shouldSkip: !result.shouldEngage, reason: result.reason };
}

function headlineIsIrrelevant(headline: string): boolean {
  if (!headline || headline === "Unknown") return true;
  return HEADLINE_BLACKLIST.some((w) => headline.toLowerCase().includes(w));
}

function detectKeyEvents(messages: MessageEntry[]) {
  const now = Date.now();
  const lastMsg = messages[messages.length - 1];
  const lastActivity = lastMsg?.timestamp ?? now;
  const daysSinceLastActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));

  let schedulingLinkSent = false;
  let schedulingLinkTimestamp: number | null = null;
  let leadConfirmedInterest = false;
  let reschedulingRequested = false;
  let reschedulingReason: string | null = null;
  let leadShowedStrongInterest = false;

  for (const msg of messages) {
    const lower = msg.content.toLowerCase();

    if (msg.type === "sent" && containsSchedulingLink(msg.content)) {
      schedulingLinkSent = true;
      schedulingLinkTimestamp = msg.timestamp;
    }

    if (msg.type === "received") {
      if (isLeadConfirmation(msg.content)) {
        leadConfirmedInterest = true;
      }

      if (
        ["tell me more", "interested", "sounds interesting", "would be great", "please", "yes please", "walkthrough", "demo", "show me"].some((s) =>
          lower.includes(s)
        )
      ) {
        leadShowedStrongInterest = true;
      }

      for (const { pattern, reason } of RESCHEDULE_REASON_PATTERNS) {
        if (lower.includes(pattern)) {
          reschedulingRequested = true;
          reschedulingReason = reason;
          break;
        }
      }
    }
  }

  return {
    schedulingLinkSent,
    schedulingLinkTimestamp,
    leadConfirmedInterest,
    reschedulingRequested,
    reschedulingReason,
    daysSinceLastActivity,
    lastMessageIsShortPing: lastMsg ? isShortPing(lastMsg.content) : false,
    iSentLastMessage: lastMsg?.type === "sent",
    leadShowedStrongInterest,
  };
}

function buildConversationContext(messages: MessageEntry[], closeState: ConversationCloseState, leadName: string) {
  const keyEvents = detectKeyEvents(messages);
  const msgCount = messages.length;

  let state = "active";
  let stateDescription: string;
  let keyContextSummary: string;
  let responseGuidance: string;

  if (msgCount <= 4) {
    state = "new";
    stateDescription = "New conversation - still building rapport";
    keyContextSummary = "This is a fresh conversation.";
    responseGuidance = "Be friendly and conversational. Don't push too hard - build rapport first.";
  } else if (closeState.closeType === "pending_meeting") {
    state = "pendingmeeting";
    if (keyEvents.reschedulingRequested && keyEvents.reschedulingReason) {
      stateDescription = `Pending meeting - they asked to reschedule due to ${keyEvents.reschedulingReason}`;
      keyContextSummary = "You sent a scheduling link. They asked to reschedule. Now they're back.";
      responseGuidance = keyEvents.lastMessageIsShortPing
        ? "Be warm and welcoming. Reference their break. Ask if they're ready to schedule."
        : "Answer their questions and offer to schedule.";
    } else {
      stateDescription = "Pending meeting - scheduling link sent";
      keyContextSummary = "You already sent a scheduling link and they showed interest.";
      responseGuidance = "Be helpful. Acknowledge warmly and offer to help schedule.";
    }
  } else if (closeState.closeType === "my_close") {
    state = "closed";
    stateDescription = "Conversation was closed/declined";
    keyContextSummary = "You previously closed this conversation politely.";
    responseGuidance = "Be polite but brief. Don't re-pitch aggressively.";
  } else if (keyEvents.daysSinceLastActivity > 14) {
    state = "reengaging";
    stateDescription = `Re-engaging after ${keyEvents.daysSinceLastActivity} days`;
    keyContextSummary = `It's been ${keyEvents.daysSinceLastActivity} days since the last message.`;
    responseGuidance = "Acknowledge the time gap briefly. Don't be pushy.";
  } else {
    state = "active";
    stateDescription = keyEvents.leadShowedStrongInterest ? "Active - lead has shown strong interest" : "Active conversation";
    keyContextSummary = "Ongoing conversation.";
    responseGuidance = "Be helpful and natural. Match their energy.";
  }

  if (keyEvents.lastMessageIsShortPing && state !== "pendingmeeting") {
    responseGuidance = "Their last message was a short greeting - respond warmly first.";
  }

  return { state, stateDescription, keyContextSummary, responseGuidance };
}

// UPDATED: fetchReply handles Routeway and Groq key rotation
async function fetchReply(
  apiKey: string,
  prompt: string,
  fullHistory: MessageEntry[],
  leadName: string,
  myName: string,
  leadProfile: any,
  provider: AIProvider,
  modelId: string,
  closeState?: ConversationCloseState
): Promise<{ shouldReply: boolean; reason: string; reply: string; tokensUsed: number }> {
  const recentMessages = fullHistory.slice(-50);
  const conversationText = recentMessages.map((msg) => `${msg.speaker}: ${msg.content}`).join("\n");

  const conversationContext = buildConversationContext(
    fullHistory,
    closeState ?? { isClosed: false, closeType: "none", closeTimestamp: null, reason: "" },
    leadName
  );

  const profileContext = leadProfile ? `\n\nPROFILE:\n${formatProfileForAI(leadProfile)}` : "";

  const userPrompt = prompt
    .replace("{extractedtext}", conversationText)
    .replace("{username}", leadName)
    .replace("{leadheadline}", leadProfile?.headline ?? "Unknown");

  const systemPrompt = `You are a real professional messaging on LinkedIn (NOT an AI assistant).${profileContext}

CONVERSATION STATE:
STATE: ${conversationContext.stateDescription}
CONTEXT: ${conversationContext.keyContextSummary}

YOUR TASK:
1. DECIDE: Should I reply to this conversation?
   Consider:
   - Is the lead genuinely interested or just being polite?
   - Are they asking a real question or making small talk?
   - Would a reply add value or seem pushy?

2. IF YES: Craft a natural, human-like reply (15-30 words)
3. IF NO: Explain why briefly

${conversationContext.responseGuidance}

CONVERSATION HISTORY:
${conversationText}

USER'S INSTRUCTIONS:
${userPrompt}

OUTPUT FORMAT (JSON ONLY):
Respond with ONLY valid JSON in this exact format:
{
  "shouldreply": true,
  "reason": "brief explanation of decision",
  "reply": "your message here or empty string if shouldreply is false"
}

CRITICAL WRITING RULES (if replying):
1. LENGTH: 15-30 words max. Be concise.
2. NATURAL VOICE: You're a real person, not AI. Sound spontaneous and varied.
3. NO AI PATTERNS:
   - Avoid formal transitions ("However", "Thus", "Moreover")
   - Use casual alternatives ("Honestly", "Well", "actually", "You know")
   - Break perfect grammar occasionally - use contractions naturally
   - Vary sentence length - mix short punchy ones with longer thoughts
4. BANNED PHRASES (never use these):
   - "I'd love to"
   - "I'd be happy to"
   - "I wanted to reach out"
   - "I hope this finds you well"
5. TONE & STYLE:
   - Active voice only (not "It is believed" but "People believe")
   - Match their energy level
   - Be opinionated when appropriate, not neutral
   - Use natural hesitations or informal phrasing
6. PUNCTUATION:
   - Don't overuse commas or semicolons
   - Keep it simple and conversational
7. CONTEXT AWARENESS:
   - If they say "hi" or "hey", respond warmly FIRST
   - Don't immediately pitch or send links after a greeting
   - Reference shared context naturally
   - Show you're paying attention to their situation

Remember: You're ${myName}. Write like a real human having a genuine conversation - imperfect, dynamic, uniquely expressive.`;

  if (provider === "groq") {
    // Groq: Use Chat Completions API
    const response = await fetchWithBackoff(
      () =>
        fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: "system", content: systemPrompt },
              ...recentMessages.map((msg) => ({
                role: msg.type === "received" ? "user" : "assistant",
                content: msg.content,
              })),
            ],
            max_tokens: 250,
            temperature: 0.7,
          }),
        }),
      3,
      1000
    );

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`Groq API Error: ${response.status} ${bodyText.slice(0, 500)}`);
    }

    const data = await response.json();
    const tokensUsed = (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0);
    const replyText = data.choices[0].message.content.trim();

    // Parse JSON response
    let responseData: any;
    try {
      responseData = JSON.parse(replyText);
    } catch (e) {
      responseData = { shouldreply: true, reason: "AI response parsing failed", reply: replyText };
    }

    return {
      shouldReply: responseData.shouldreply ?? true,
      reason: responseData.reason ?? "No reason provided",
      reply: responseData.reply ?? replyText,
      tokensUsed,
    };
  } else if (provider === "routeway") {
    // Routeway: OpenAI Compatible API
    const response = await fetchWithBackoff(
      () =>
        fetch("https://api.routeway.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: "system", content: systemPrompt },
              ...recentMessages.map((msg) => ({
                role: msg.type === "received" ? "user" : "assistant",
                content: msg.content,
              })),
            ],
            max_tokens: 250,
            temperature: 0.7,
          }),
        }),
      3,
      1000
    );

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`Routeway API Error: ${response.status} ${bodyText.slice(0, 500)}`);
    }

    const data = await response.json();
    const tokensUsed = (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0);
    const replyText = data.choices[0].message.content.trim();

    // Parse JSON response
    let responseData: any;
    try {
      responseData = JSON.parse(replyText);
    } catch (e) {
      responseData = { shouldreply: true, reason: "AI response parsing failed", reply: replyText };
    }

    return {
      shouldReply: responseData.shouldreply ?? true,
      reason: responseData.reason ?? "No reason provided",
      reply: responseData.reply ?? replyText,
      tokensUsed,
    };
  } else {
    // OpenAI: Use new Responses API for GPT-5/GPT-4.1 models
    const inputMessages = [
      { role: "developer" as const, content: systemPrompt },
      ...recentMessages.map((msg) => ({
        role: (msg.type === "received" ? "user" : "assistant") as "user" | "assistant",
        content: msg.content,
      })),
    ];

    const response = await fetchWithBackoff(
      () =>
        fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelId,
            input: inputMessages,
          }),
        }),
      3,
      1000
    );

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`OpenAI API Error: ${response.status} ${bodyText.slice(0, 500)}`);
    }

    const data = await response.json();
    let replyText = "";
    const tokensUsed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);

    if (data.output_text) {
      replyText = data.output_text;
    } else if (data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === "message" && item.content) {
          for (const contentItem of item.content) {
            if (contentItem.type === "output_text" && contentItem.text) {
              replyText = contentItem.text;
              break;
            }
          }
        }
        if (replyText) break;
      }
    }

    if (!replyText) {
      throw new Error("OpenAI returned empty response - no text content found");
    }

    let responseData: any;
    try {
      responseData = JSON.parse(replyText.trim());
    } catch (e) {
      responseData = { shouldreply: true, reason: "AI response parsing failed", reply: replyText.trim() };
    }

    return {
      shouldReply: responseData.shouldreply ?? true,
      reason: responseData.reason ?? "No reason provided",
      reply: responseData.reply ?? replyText.trim(),
      tokensUsed,
    };
  }
}

function getMyName(): string {
  const nameEl = document.querySelector(".global-nav__me-content span") as HTMLElement;
  return nameEl?.textContent?.trim() ?? "You";
}

function getModelDisplayName(modelId: string): string {
  return MODEL_DISPLAY_NAMES[modelId] ?? modelId;
}

function getProviderDisplayName(provider: AIProvider): string {
  if (provider === "groq") return "Groq";
  if (provider === "routeway") return "Routeway";
  return "OpenAI";
}

function isBlacklisted(leadName: string, profile: any): boolean {
  const checkStrings = [leadName.toLowerCase(), profile?.company?.toLowerCase(), profile?.jobTitle?.toLowerCase()];
  for (const entry of blacklist) {
    const entryLower = entry.toLowerCase();
    for (const check of checkStrings) {
      if (check && check.includes(entryLower)) return true;
    }
  }
  return false;
}

async function waitForReplyApproval(leadName: string, reply: string): Promise<{ approved: boolean; reply: string }> {
  return new Promise((resolve) => {
    pendingReplyResolve = resolve;
    chrome.storage.local.set({ pendingReply: { leadName, reply, timestamp: Date.now() } });
    addLog("INFO", `Waiting for approval to reply to ${leadName}...`, "System");

    setTimeout(() => {
      if (pendingReplyResolve) {
        addLog("WARNING", `Reply approval timed out for ${leadName}`, "System");
        pendingReplyResolve({ approved: false, reply: "" });
        pendingReplyResolve = null;
        chrome.storage.local.remove("pendingReply");
      }
    }, 5 * 60 * 1000);
  });
}

async function waitForElement<T extends Element>(selector: string, tries = 6, delayMs = 400): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    const el = document.querySelector<T>(selector);
    if (el) return el;
    await delay(delayMs);
  }
  return null;
}

function randomDelay(min: number, max: number) {
  return delay(Math.floor(Math.random() * (max - min + 1) + min));
}

function getErrorMsg(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) return (err as any).message;
  return "Unknown error";
}

// ✅ NEW: AI-based webhook trigger detection
/**
 * AI-based webhook trigger detection
 * Checks if lead shared contact info (calendar link, email, phone) in last 10 messages
 */
async function shouldFireWebhook(
  apiKey: string,
  messages: MessageEntry[],
  leadName: string,
  provider: AIProvider,
  modelId: string
): Promise<{ shouldFire: boolean; reason: string }> {
  // Check last 10 messages only
  const last10 = messages.slice(-10);
  const conversationText = last10.map((m) => `${m.speaker}: ${m.content}`).join("\n");

  const systemPrompt = `You are analyzing a LinkedIn conversation to detect if contact information was shared.

LAST 10 MESSAGES:
${conversationText}

QUESTION: Has ${leadName} (the lead) shared ANY of the following in these messages:
1. A scheduling/calendar link (Calendly, Cal.com, Outlook booking, HubSpot meetings, etc.)
2. An email address (for direct contact)
3. A phone number (for direct contact)

RULES:
- ONLY count contact info if ${leadName} (the lead) shared it, NOT if you shared it
- Ignore email/phone in automatic signatures
- Focus on INTENTIONAL sharing (e.g., "here's my calendar", "email me at", "call me at")
- Even soft signals like "let's schedule" WITH a way to reach them directly counts

Respond with ONLY ONE LINE in this exact format:
YES: [specific reason - e.g., "Shared Calendly link", "Gave email address", "Provided phone number"]
OR
NO: [brief reason why no contact info was shared]`;

  try {
    let content = "";

    if (provider === "groq") {
      const response = await fetchWithBackoff(
        () =>
          fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: "user", content: systemPrompt }],
              max_tokens: 50,
              temperature: 0.2,
            }),
          }),
        3,
        1000
      );

      if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
      const data = await response.json();
      content = data.choices?.[0]?.message?.content?.trim() || "";
    } else if (provider === "routeway") {
      const response = await fetchWithBackoff(
        () =>
          fetch("https://api.routeway.ai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: "user", content: systemPrompt }],
              max_tokens: 50,
              temperature: 0.2,
            }),
          }),
        3,
        1000
      );

      if (!response.ok) throw new Error(`Routeway API error: ${response.status}`);
      const data = await response.json();
      content = data.choices?.[0]?.message?.content?.trim() || "";
    } else {
      // OpenAI
      const response = await fetchWithBackoff(
        () =>
          fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: modelId,
              input: systemPrompt,
            }),
          }),
        3,
        1000
      );

      if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
      const data = await response.json();

      if (data.output_text) {
        content = data.output_text.trim();
      } else if (data.output && Array.isArray(data.output)) {
        for (const item of data.output) {
          if (item.type === "message" && item.content) {
            for (const contentItem of item.content) {
              if (contentItem.type === "output_text" && contentItem.text) {
                content = contentItem.text.trim();
                break;
              }
            }
          }
          if (content) break;
        }
      }
    }

    const shouldFire = content.toUpperCase().startsWith("YES");
    const reason = content.split(":")[1]?.trim() || "AI webhook decision";

    return { shouldFire, reason };
  } catch (e) {
    addLog("ERROR", `Webhook AI check failed: ${getErrorMsg(e)}`, "System");
    return { shouldFire: false, reason: "AI error - skipping webhook" };
  }
}

// ✅ NEW: Duplicate prevention helpers
/**
 * Check if webhook already fired for this lead
 */
async function hasWebhookBeenFired(leadId: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["webhookFiredLeads"], (result) => {
      const firedLeads = result.webhookFiredLeads || {};
      resolve(!!firedLeads[leadId]);
    });
  });
}

/**
 * Mark webhook as fired for this lead (prevents duplicates)
 */
async function markWebhookFired(leadId: string, reason: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["webhookFiredLeads"], (result) => {
      const firedLeads = result.webhookFiredLeads || {};
      firedLeads[leadId] = {
        firedAt: Date.now(),
        reason,
      };
      chrome.storage.local.set({ webhookFiredLeads: firedLeads }, () => {
        resolve();
      });
    });
  });
}

// --- MAIN LOOP ---
async function runIteration(n: number) {
  addLog("INFO", `Starting batch of ${n} chats...`, "System");

  const settings = await getSettings();

  // Removed old decisionProvider vars, added new keys and models
  const {
    apiKey,
    groqApiKey,
    groqApiKey2,
    routewayApiKey,
    chatMin,
    chatMax,
    loopMin,
    loopMax,
    prompt,
    leadPrompt,
    webhookUrl,
    startHour,
    endHour,
    replyProvider,
    leadDetectionProvider,
    groqModel,
    openaiModel,
    routewayModel,
  } = settings;

  // Resolve API keys based on provider
  const replyApiKey = getApiKeyForProvider(replyProvider, apiKey, groqApiKey, groqApiKey2, routewayApiKey);
  const leadDetectionApiKey = getApiKeyForProvider(leadDetectionProvider, apiKey, groqApiKey, groqApiKey2, routewayApiKey);

  // Resolve Model ID based on provider
  const replyModelId = getModelForProvider(replyProvider, groqModel, openaiModel, routewayModel);
  const currentModelName = getModelDisplayName(replyModelId);
  updateStats("currentModel", currentModelName);

  blacklist = (await chrome.storage.local.get("blacklist")).blacklist ?? [];

  if (!isWithinWorkingHours(startHour, endHour)) {
    addLog("WARNING", `Outside working hours (${startHour}-${endHour}). Pausing.`, "System");
    if (botRunning && !botPaused) {
      botLoopTimeout = window.setTimeout(() => runIteration(n), 15 * 60 * 1000);
    }
    return;
  }

  const myName = getMyName();
  await scrollConversationList(5);

  let chats = Array.from(document.querySelectorAll("ul.msg-conversations-container__conversations-list > li"))
    .slice(0, n)
    .sort(() => Math.random() - 0.2);

  addLog("INFO", `Found ${chats.length} conversations to check.`, "Bot");

  for (let i = 0; i < chats.length && botRunning; i++) {
    while (botPaused && botRunning) await delay(1000);
    if (!botRunning) break;

    await humanScroll();
    await randomDelay(chatMin, chatMax);

    const clickable = chats[i].querySelector<HTMLElement>("a, .msg-conversation-listitem__link, [tabindex='0']");
    clickable?.click();
    await delay(2000);

    const leadName = getLeadName();
    if (!leadName) continue;

    const lastMsg = getLastMessage(leadName);
    if (!lastMsg || !lastMsg.fromLead) {
      addLog("INFO", `Skipping ${leadName}: Last message was from me.`, "Bot");
      continue;
    }

    // Get recent messages for AI decision
    const recentLeadMessages = getRecentLeadMessages(leadName, 5);
    const fullConversation = await getOrCreateConversationHistory(leadName);
    const closeState = getConversationCloseState(fullConversation.messages);
    const keyEvents = detectKeyEvents(fullConversation.messages);

    // ✅ UPDATED: AI-based webhook trigger (checks last 10 messages for contact info)
    if (webhookUrl) {
      const alreadyFired = await hasWebhookBeenFired(fullConversation.leadId);

      if (!alreadyFired) {
        try {
          // Ask AI if webhook should fire
          const webhookCheck = await shouldFireWebhook(replyApiKey, fullConversation.messages, leadName, replyProvider, replyModelId);

          if (webhookCheck.shouldFire) {
            const payload: LeadWebhookPayload = {
              leadName,
              profileUrl: fullConversation.profileUrl,
              company: fullConversation.profile?.company ?? "Unknown",
              jobTitle: fullConversation.profile?.jobTitle ?? "Unknown",
              headline: fullConversation.profile?.headline ?? "Unknown",
              conversationHistory: fullConversation.messages.map((m) => `${m.speaker}: ${m.content}`).join("\n"),
              messageCount: fullConversation.messages.length,
              detectedAt: new Date().toISOString(),
            };

            await sendLeadWebhook(payload);
            await markWebhookFired(fullConversation.leadId, webhookCheck.reason);

            addLog("SUCCESS", `🔥 LEAD CAPTURED: ${leadName} (${webhookCheck.reason})`, "Bot");
          }
        } catch (e) {
          addLog("ERROR", `Webhook check failed: ${getErrorMsg(e)}`, "System");
        }
      } else {
        // Already fired - skip silently (optional: comment out this log to reduce noise)
        addLog("INFO", `Webhook already sent for ${leadName}, skipping duplicate`, "System");
      }
    }

    // AI-based skip decision for close states using main reply provider now
    if (closeState.isClosed) {
      const skipCheck = await shouldSkipDueToCloseState(closeState, recentLeadMessages, replyApiKey, replyProvider);
      if (skipCheck.shouldSkip) {
        addLog("INFO", `Skipping ${leadName}: ${skipCheck.reason} (AI/${closeState.closeType})`, "Bot");
        continue;
      }
      addLog("INFO", `Engaging ${leadName}: ${skipCheck.reason} (AI)`, "Bot");
    }

    const headline = fullConversation.profile?.headline ?? "Unknown";
    if (headlineIsIrrelevant(headline) && !lastMsg.content.includes("?") && lastMsg.content.split(" ").length < 12) {
      addLog("INFO", `Skipping ${leadName}: Irrelevant headline`, "Bot");
      continue;
    }

    if (isBlacklisted(leadName, fullConversation.profile)) {
      addLog("WARNING", `Skipping ${leadName}: Blacklisted`, "Bot");
      continue;
    }

    addLog("INFO", `Checking chat with ${formatProfileForDisplay(leadName, fullConversation.profile)}...`, "Bot");
    updateStats("chatsProcessed", 1);

    if (fullConversation.messages.length === 0) {
      addLog("WARNING", `No messages found for ${leadName}`, "System");
      continue;
    }

    // Lead detection uses specific lead detection provider settings
    if (webhookUrl) {
      try {
        const recentMsgs = fullConversation.messages.slice(-2).map((m) => m.content);
        const isPositive = await checkPositiveLead(leadDetectionApiKey, leadPrompt, recentMsgs, leadDetectionProvider);

        if (isPositive) {
          const alreadyFired = await hasWebhookBeenFired(fullConversation.leadId);

          if (!alreadyFired) {
            const payload: LeadWebhookPayload = {
              leadName,
              profileUrl: fullConversation.profileUrl,
              company: fullConversation.profile?.company ?? "Unknown",
              jobTitle: fullConversation.profile?.jobTitle ?? "Unknown",
              headline: fullConversation.profile?.headline ?? "Unknown",
              conversationHistory: fullConversation.messages.map((m) => `${m.speaker}: ${m.content}`).join("\n"),
              messageCount: fullConversation.messages.length,
              detectedAt: new Date().toISOString(),
            };

            await sendLeadWebhook(payload);
            await markWebhookFired(fullConversation.leadId, "AI positive lead detection");
            updateStats("leadsFound", 1);

            addLog("SUCCESS", `🔥 HOT LEAD: ${leadName} (AI detected)`, "Bot");
          }
        }
      } catch (e) {
        addLog("ERROR", `Lead webhook failed: ${getErrorMsg(e)}`, "System");
      }
    }

    // Combined decision + reply in single call
    let replyData: { shouldReply: boolean; reason: string; reply: string; tokensUsed: number };
    try {
      replyData = await fetchReply(
        replyApiKey,
        prompt,
        fullConversation.messages,
        leadName,
        myName,
        fullConversation.profile,
        replyProvider,
        replyModelId,
        closeState
      );
      updateStats("tokensUsed", replyData.tokensUsed);

      // Log the combined decision + reply
      addLog(
        "ACTION",
        `AI Decision: ${replyData.shouldReply ? "REPLY" : "SKIP"} - ${replyData.reason} (${getProviderDisplayName(replyProvider)})`,
        "Bot"
      );

      // Skip if AI says no
      if (!replyData.shouldReply) {
        addLog("INFO", `Skipping ${leadName}: ${replyData.reason}`, "Bot");
        continue;
      }
    } catch (e) {
      addLog("ERROR", `Reply Generation Failed: ${getErrorMsg(e)}`, "System");
      continue;
    }

    let finalReply = replyData.reply;

    if (replyPreviewEnabled) {
      const approval = await waitForReplyApproval(leadName, replyData.reply);
      if (!approval.approved) {
        addLog("INFO", `Reply to ${leadName} skipped by user`, "User");
        continue;
      }
      finalReply = approval.reply;
    }

    const input = await waitForElement<HTMLElement>("div.msg-form__contenteditable[role='textbox']", 6, 400);
    const sendBtn = await waitForElement<HTMLButtonElement>("button.msg-form__send-button", 6, 400);

    if (input && sendBtn) {
      const conversationMeta = {
        messageCount: fullConversation.messages.length,
        lastMessageQuestions: fullConversation.messages[fullConversation.messages.length - 1]?.content.match(/\?/g)?.length ?? 0,
      };

      const shouldSplit = shouldDoubleText(finalReply, conversationMeta);
      const doubleTextPattern = shouldSplit ? generateDoubleText(finalReply, conversationMeta) : null;

      if (doubleTextPattern) {
        addLog("ACTION", `Double-texting ${leadName} (${doubleTextPattern.pattern})...`, "Bot");

        await delay(calculateTypingDelay(doubleTextPattern.firstMessage));
        await setEditableText(input, doubleTextPattern.firstMessage);
        await delay(800);

        if (!sendBtn.hasAttribute("disabled")) {
          sendBtn.click();
          await delay(500);
        }

        const betweenDelay = calculateDoubleTextDelay(doubleTextPattern.pattern);
        addLog("INFO", `Waiting ${Math.round(betweenDelay / 1000)}s before second message...`, "Bot");
        await delay(betweenDelay);

        await delay(calculateTypingDelay(doubleTextPattern.secondMessage));
        await setEditableText(input, doubleTextPattern.secondMessage);
        await delay(800);

        if (!sendBtn.hasAttribute("disabled")) {
          sendBtn.click();
          await delay(500);
        }

        updateStats("repliesSent", 1);
        fullConversation.messages.push(
          {
            speaker: myName,
            content: doubleTextPattern.firstMessage,
            timestamp: Date.now() - betweenDelay,
            type: "sent",
          },
          {
            speaker: myName,
            content: doubleTextPattern.secondMessage,
            timestamp: Date.now(),
            type: "sent",
          }
        );
        fullConversation.metadata.lastActivity = Date.now();
        fullConversation.metadata.lastMessageFrom = "me";
        fullConversation.metadata.totalMessages += 2;
        fullConversation.metadata.lastSyncedAt = Date.now();
        await saveConversation(fullConversation);

        addLog("SUCCESS", `Double-texted ${formatProfileForDisplay(leadName, fullConversation.profile)} (${currentModelName})`, "Bot");
      } else {
        const typingDelay = calculateTypingDelay(finalReply);
        addLog("ACTION", `Typing reply to ${leadName} (waiting ${Math.round(typingDelay / 1000)}s)...`, "Bot");

        await delay(typingDelay);
        await setEditableText(input, finalReply);
        await delay(800);

        if (!sendBtn.hasAttribute("disabled")) {
          sendBtn.click();
          await delay(500);
        }

        if ((input.textContent?.trim().length ?? 0) === 0) {
          updateStats("repliesSent", 1);
          fullConversation.messages.push({
            speaker: myName,
            content: finalReply,
            timestamp: Date.now(),
            type: "sent",
          });
          fullConversation.metadata.lastActivity = Date.now();
          fullConversation.metadata.lastMessageFrom = "me";
          fullConversation.metadata.totalMessages++;
          fullConversation.metadata.lastSyncedAt = Date.now();
          await saveConversation(fullConversation);

          addLog("SUCCESS", `Sent reply to ${formatProfileForDisplay(leadName, fullConversation.profile)} (${currentModelName})`, "Bot");
        } else {
          addLog("WARNING", `Message may not have sent to ${leadName}`, "System");
        }
      }
    } else {
      addLog("ERROR", "Could not find chat input or send button", "System");
    }

    await randomDelay(chatMin, chatMax);
  }

  addLog("INFO", "Batch finished. Sleeping...", "System");

  if (botRunning && !botPaused) {
    botLoopTimeout = window.setTimeout(() => runIteration(n), Math.floor(Math.random() * (loopMax - loopMin + 1) + loopMin));
  }
}

// --- MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((msg: ContentCommand, sender, sendResponse) => {
  if (msg.type === "PINGTEST") {
    sendResponse("Content script active!");
    return;
  }

  if (msg.type === "GET_STATUS") {
    sendResponse({ running: botRunning, paused: botPaused, stats, logs });
    return;
  }

  if (msg.type === "START_BOT") {
    if (!botRunning) {
      botRunning = true;
      botPaused = false;
      stats = { chatsProcessed: 0, repliesSent: 0, leadsFound: 0, startTime: Date.now(), tokensUsed: 0, currentModel: "" };
      replyPreviewEnabled = (msg as any).config?.replyPreviewEnabled ?? false;
      blacklist = (msg as any).config?.blacklist ?? [];
      const nChats = (msg as any).config?.nChats ?? 10;

      addLog("INFO", `Bot started (Preview: ${replyPreviewEnabled ? "ON" : "OFF"})`, "User");
      runIteration(nChats);
      sendResponse({ status: "ok" });
    } else {
      sendResponse({ status: "error", error: "Already running" });
    }
    return;
  }

  if (msg.type === "STOP_BOT") {
    botRunning = false;
    botPaused = false;
    if (botLoopTimeout !== null) clearTimeout(botLoopTimeout);
    addLog("INFO", "Bot stopped by user", "User");
    sendResponse({ status: "stopped" });
    return;
  }

  if (msg.type === "PAUSEBOT") {
    if (botRunning && !botPaused) {
      botPaused = true;
      addLog("INFO", "Bot paused by user", "User");
      sendResponse({ status: "paused" });
    } else {
      sendResponse({ status: "error", error: "Not running or already paused" });
    }
    return;
  }

  if (msg.type === "RESUMEBOT") {
    if (botRunning && botPaused) {
      botPaused = false;
      addLog("INFO", "Bot resumed by user", "User");
      sendResponse({ status: "running" });
    } else {
      sendResponse({ status: "error", error: "Not paused" });
    }
    return;
  }

  if (msg.type === "APPROVEREPLY") {
    if (pendingReplyResolve) {
      addLog("SUCCESS", `Reply to ${msg.leadName} approved`, "User");
      pendingReplyResolve({ approved: true, reply: msg.reply });
      pendingReplyResolve = null;
      chrome.storage.local.remove("pendingReply");
    }
    sendResponse({ status: "ok" });
    return;
  }

  if (msg.type === "REJECTREPLY") {
    if (pendingReplyResolve) {
      addLog("INFO", `Reply to ${msg.leadName} rejected`, "User");
      pendingReplyResolve({ approved: false, reply: "" });
      pendingReplyResolve = null;
      chrome.storage.local.remove("pendingReply");
    }
    sendResponse({ status: "ok" });
    return;
  }

  if (msg.type === "CHECKUNREAD") {
    if (botRunning && !botPaused) {
      addLog("INFO", "Check unread triggered by background", "System");
    }
    sendResponse({ status: "ok" });
    return;
  }
});
