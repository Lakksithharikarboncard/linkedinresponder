// linkedinresponder/src/content/content.ts
import { BotCommand, BotLogEntry, BotStats, BotStatus, MessageEntry, ConversationHistory } from "../shared/types";
import { checkPositiveLead, sendLeadWebhook, shouldReplyToConversation, LeadWebhookPayload } from "../shared/sendEmail";
import { generateLeadId, loadConversation, saveConversation, shouldResync } from "../shared/conversationStorage";
import { scrapeLeadProfile, formatProfileForDisplay, formatProfileForAI } from "../shared/profileScraper";
import { shouldDoubleText, generateDoubleText, calculateDoubleTextDelay } from "../shared/doubleTextHandler";
import { getBotSettings, AIProvider } from "../shared/settings";

type ContentCommand =
  | BotCommand
  | { type: "PING_TEST" }
  | { type: "CHECK_UNREAD" }
  | { type: "PAUSE_BOT" }
  | { type: "RESUME_BOT" }
  | { type: "APPROVE_REPLY"; reply: string; leadName: string }
  | { type: "REJECT_REPLY"; leadName: string };

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
let useStrictHours = true;
let useGroq = false;
let groqModel = "llama-3.3-70b-versatile";
let replyPreviewEnabled = false;
let pendingReplyResolve: ((approved: { approved: boolean; reply: string }) => void) | null = null;
let blacklist: string[] = [];

// --- CONSTANTS / GUARDS ---
const HEADLINE_BLACKLIST = ["student", "intern", "seeking", "open to work", "looking for", "hiring"];

// Cooldown after any close (rejection OR positive scheduling confirmation)
const CLOSE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// ✅ FIXED: Patterns that indicate YOU closed the conversation (rejection/soft close)
// Removed "no problem" - too ambiguous, often used in positive rescheduling contexts
const MY_CLOSE_PATTERNS = [
  "no overlap",
  "not a fit",
  "reach out if",
  "feel free to reach out",
  "thanks for letting me know",
  // "no problem", // ❌ REMOVED - causes false positives in rescheduling scenarios
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

// ✅ NEW: Positive context words that NEGATE close detection
// If a message contains both a close pattern AND these words, it's NOT a close
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

// ✅ NEW: Patterns that indicate a SOFT positive response (not a hard close)
// Used to detect when "no problem" is actually positive
const SOFT_POSITIVE_PATTERNS = [
  "no problem",
  "no worries", 
  "sure thing",
  "of course",
  "absolutely",
  "definitely",
];

// Patterns that indicate YOU sent a scheduling link/CTA
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

// Patterns that indicate LEAD confirmed/acknowledged positively (conversation complete)
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
  "great, thanks",
  "awesome",
  "cool",
  "ok great",
  "okay great",
  "works for me",
];

// Short ping messages that shouldn't trigger auto-reply after close
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

// --- HELPERS ---
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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
      await sleep(backoffDelay);
      attempt++;
      continue;
    }
    return res;
  }
}

function addLog(
  type: "INFO" | "ACTION" | "ERROR" | "SUCCESS" | "WARNING",
  message: string,
  actor: "User" | "Bot" | "System"
) {
  const entry: BotLogEntry = { time: Date.now(), type, message, actor };
  logs.unshift(entry);
  if (logs.length > 100) logs.pop();
  chrome.storage.local.set({ botLog: logs.slice(0, 50) });
}

function updateStats(key: keyof BotStats, value: number | string) {
  if (key === "startTime") stats.startTime = value as number;
  else if (key === "currentModel") stats.currentModel = value as string;
  else (stats[key] as number) += value as number;
}

function calculateTypingDelay(text: string): number {
  const words = text.split(" ").length;
  const baseDelay = 2000;
  const msPerWord = 300;
  return baseDelay + words * msPerWord + Math.random() * 2000;
}

function isWithinWorkingHours(startHour: number = 9, endHour: number = 18): boolean {
  const currentHour = new Date().getHours();
  return currentHour >= startHour && currentHour < endHour;
}

async function setEditableText(input: HTMLElement, text: string) {
  input.focus();
  await delay(50);
  document.execCommand("selectAll", false, "");
  document.execCommand("delete", false, "");
  for (const char of text) {
    document.execCommand("insertText", false, char);
    const charDelay = Math.random() > 0.9 ? 150 : 30 + Math.random() * 50;
    await delay(charDelay);
  }
}

async function humanScroll() {
  const pane = document.querySelector<HTMLElement>(".msg-s-message-list-content");
  if (!pane) return;
  const down = Math.random() * 80 + 20;
  pane.scrollBy(0, down);
  await delay(300 + Math.random() * 500);
  pane.scrollBy(0, -(Math.random() * 50 + 10));
  await delay(300 + Math.random() * 500);
}

async function scrollConversationList(times: number = 5) {
  const container = document.querySelector<HTMLElement>(".msg-conversations-container--inbox-shortcuts");
  if (!container) return;
  for (let i = 0; i < times; i++) {
    container.scrollBy({ top: Math.random() * 200 + 100, behavior: "smooth" });
    await delay(500 + Math.random() * 800);
    container.scrollBy({ top: -(Math.random() * 50), behavior: "smooth" });
    await delay(400 + Math.random() * 500);
  }
}

function getApiKeyForProvider(provider: AIProvider, apiKey: string, groqApiKey: string): string {
  return provider === "groq" ? groqApiKey : apiKey;
}

async function getSettings(): Promise<{
  apiKey: string;
  groqApiKey: string;
  chatMin: number;
  chatMax: number;
  loopMin: number;
  loopMax: number;
  prompt: string;
  leadPrompt: string;
  webhookUrl: string;
  startHour: number;
  endHour: number;
  replyProvider: AIProvider;
  decisionProvider: AIProvider;
  leadDetectionProvider: AIProvider;
}> {
  const s = await getBotSettings();
  return {
    apiKey: s.openaiApiKey,
    groqApiKey: s.groqApiKey,
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
    decisionProvider: s.decisionProvider,
    leadDetectionProvider: s.leadDetectionProvider,
  };
}

function getLeadName(): string | null {
  const el = document.evaluate(
    '//*[@id="thread-detail-jump-target"]/div/a/div/dl/dt/h2',
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  ).singleNodeValue as HTMLElement | null;
  return el?.textContent?.trim() || null;
}

function getLeadProfileUrl(): string {
  const profileLink = document.querySelector<HTMLAnchorElement>('a[href*="/in/"]');
  return profileLink?.href || window.location.href;
}

function getLastMessage(leadName: string): { fromLead: boolean; content: string } | null {
  const events = Array.from(document.querySelectorAll("li.msg-s-message-list__event"));
  for (let i = events.length - 1; i >= 0; i--) {
    const msgEl = events[i];
    const senderEl = msgEl.querySelector("span.msg-s-message-group__name");
    const contentEl = msgEl.querySelector("p.msg-s-event-listitem__body");
    if (senderEl && contentEl) {
      const sender = senderEl.textContent?.trim() || "";
      const content = contentEl.textContent?.trim() || "";
      if (!content) continue;
      return { fromLead: sender.includes(leadName), content };
    }
  }
  return null;
}

async function scrollToLoadAllMessages() {
  const messagePane = document.querySelector<HTMLElement>(".msg-s-message-list-content");
  if (!messagePane) return;
  let previousHeight = 0;
  let currentHeight = messagePane.scrollHeight;
  let attempts = 0;
  const maxAttempts = 50;
  addLog("INFO", "Loading full conversation history...", "System");
  while (currentHeight > previousHeight && attempts < maxAttempts) {
    previousHeight = currentHeight;
    messagePane.scrollTo({ top: 0, behavior: "smooth" });
    await delay(800 + Math.random() * 400);
    currentHeight = messagePane.scrollHeight;
    attempts++;
  }
  addLog("INFO", `Loaded ${attempts} message batches`, "System");
}

async function getCompleteConversation(leadName: string): Promise<MessageEntry[]> {
  await scrollToLoadAllMessages();
  const events = Array.from(document.querySelectorAll("li.msg-s-message-list__event"));
  const messages: MessageEntry[] = [];
  for (const msgEl of events) {
    const senderEl = msgEl.querySelector("span.msg-s-message-group__name");
    const contentEl = msgEl.querySelector("p.msg-s-event-listitem__body");
    const timeEl = msgEl.querySelector("time");
    if (senderEl && contentEl) {
      const speaker = senderEl.textContent?.trim() || "Unknown";
      const content = contentEl.textContent?.trim() || "";
      let timestamp = Date.now();
      if (timeEl) {
        const dateTimeAttr = timeEl.getAttribute("datetime");
        if (dateTimeAttr) timestamp = new Date(dateTimeAttr).getTime();
      }
      const type = speaker.includes(leadName) ? "received" : "sent";
      if (content) messages.push({ speaker, content, timestamp, type });
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
      firstContact: freshMessages[0]?.timestamp || Date.now(),
      lastActivity: lastMsg?.timestamp || Date.now(),
      lastMessageFrom: lastMsg?.type === "received" ? "lead" : "me",
      totalMessages: freshMessages.length,
      lastSyncedAt: Date.now(),
    },
  };
  await saveConversation(conversation);
  addLog(
    "SUCCESS",
    `Saved ${freshMessages.length} messages + profile for ${formatProfileForDisplay(leadName, profileData)}`,
    "System"
  );
  return conversation;
}

// Check if a message contains a scheduling link/CTA
function containsSchedulingLink(content: string): boolean {
  const lower = content.toLowerCase();
  return SCHEDULING_PATTERNS.some((pattern) => lower.includes(pattern));
}

// Check if a message is a lead confirmation (positive close)
function isLeadConfirmation(content: string): boolean {
  const lower = content.toLowerCase().trim();
  // Check if it's a short confirmation (≤ 6 words) matching patterns
  const wordCount = lower.split(/\s+/).length;
  if (wordCount > 10) return false; // Long messages aren't simple confirmations
  
  return LEAD_CONFIRMATION_PATTERNS.some((pattern) => lower.includes(pattern));
}

// Check if a message is a short ping (hi, hello, hey)
function isShortPing(content: string): boolean {
  const lower = content.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;
  
  // Must be very short (1-3 words)
  if (wordCount > 3) return false;
  
  return SHORT_PING_PATTERNS.some((pattern) => lower === pattern || lower.startsWith(pattern + " "));
}

// ✅ NEW: Check if a message has positive scheduling context
// This prevents false-positive close detection
function hasPositiveSchedulingContext(content: string): boolean {
  const lower = content.toLowerCase();
  return POSITIVE_SCHEDULING_CONTEXT.some((pattern) => lower.includes(pattern));
}

// ✅ NEW: Check if message is a soft positive (like "no problem" in positive context)
function isSoftPositiveInContext(content: string): boolean {
  const lower = content.toLowerCase();
  const hasSoftPositive = SOFT_POSITIVE_PATTERNS.some((pattern) => lower.includes(pattern));
  const hasPositiveContext = hasPositiveSchedulingContext(content);
  
  // If message has both "no problem" AND scheduling context, it's positive not a close
  return hasSoftPositive && hasPositiveContext;
}

// Check if conversation is in "pending meeting" state
// Returns timestamp of when meeting was scheduled, or null if not in pending state
function getPendingMeetingTimestamp(messages: MessageEntry[]): number | null {
  // Look backwards through messages for the pattern:
  // 1. I sent a scheduling link
  // 2. They confirmed positively
  
  for (let i = messages.length - 1; i >= 1; i--) {
    const currentMsg = messages[i];
    const prevMsg = messages[i - 1];
    
    // Pattern: My message with scheduling link → Their confirmation
    if (
      prevMsg.type === "sent" &&
      currentMsg.type === "received" &&
      containsSchedulingLink(prevMsg.content) &&
      isLeadConfirmation(currentMsg.content)
    ) {
      return currentMsg.timestamp;
    }
    
    // ✅ IMPROVED: Also check for rescheduling flow
    // Pattern: Their reschedule request → My positive response → Their confirmation
    if (i >= 2) {
      const prevPrevMsg = messages[i - 2];
      if (
        prevPrevMsg.type === "received" &&
        prevMsg.type === "sent" &&
        currentMsg.type === "received" &&
        (prevPrevMsg.content.toLowerCase().includes("schedule") ||
          prevPrevMsg.content.toLowerCase().includes("after") ||
          prevPrevMsg.content.toLowerCase().includes("next week") ||
          prevPrevMsg.content.toLowerCase().includes("vacation") ||
          prevPrevMsg.content.toLowerCase().includes("holiday")) &&
        isLeadConfirmation(currentMsg.content)
      ) {
        return currentMsg.timestamp;
      }
    }
  }
  
  return null;
}

// ✅ FIXED: Check if I soft-closed the conversation (rejection/polite close)
// Now includes context awareness to avoid false positives
function getMyCloseTimestamp(messages: MessageEntry[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === "sent") {
      const lower = m.content.toLowerCase();
      
      // ✅ NEW: Skip if message has positive scheduling context
      // e.g., "no problem, let's schedule next week" is NOT a close
      if (hasPositiveSchedulingContext(m.content)) {
        continue;
      }
      
      // ✅ NEW: Skip if this is a soft positive in context
      // e.g., "Sure, no problem" followed by scheduling talk
      if (isSoftPositiveInContext(m.content)) {
        continue;
      }
      
      // Check for actual close patterns
      if (MY_CLOSE_PATTERNS.some((p) => lower.includes(p))) {
        return m.timestamp;
      }
    }
  }
  return null;
}

// Comprehensive check for conversation close state
interface ConversationCloseState {
  isClosed: boolean;
  closeType: "none" | "my_close" | "pending_meeting" | "lead_close";
  closeTimestamp: number | null;
  reason: string;
}

function getConversationCloseState(messages: MessageEntry[]): ConversationCloseState {
  // Check for pending meeting (highest priority - this is a positive outcome)
  const pendingMeetingTs = getPendingMeetingTimestamp(messages);
  if (pendingMeetingTs) {
    return {
      isClosed: true,
      closeType: "pending_meeting",
      closeTimestamp: pendingMeetingTs,
      reason: "Meeting scheduled and confirmed",
    };
  }
  
  // Check for my soft close (rejection/polite close)
  const myCloseTs = getMyCloseTimestamp(messages);
  if (myCloseTs) {
    return {
      isClosed: true,
      closeType: "my_close",
      closeTimestamp: myCloseTs,
      reason: "I closed the conversation",
    };
  }
  
  return {
    isClosed: false,
    closeType: "none",
    closeTimestamp: null,
    reason: "",
  };
}

// ✅ IMPROVED: Determine if we should skip based on close state and incoming message
function shouldSkipDueToCloseState(
  closeState: ConversationCloseState,
  lastMessage: string
): { shouldSkip: boolean; reason: string } {
  if (!closeState.isClosed || !closeState.closeTimestamp) {
    return { shouldSkip: false, reason: "" };
  }
  
  const timeSinceClose = Date.now() - closeState.closeTimestamp;
  const isWithinCooldown = timeSinceClose < CLOSE_COOLDOWN_MS;
  const daysSinceClose = Math.round(timeSinceClose / (1000 * 60 * 60 * 24));
  
  // ✅ NEW: For pending meetings, be more lenient
  // They might be following up to actually schedule
  if (closeState.closeType === "pending_meeting") {
    // If it's a short ping AND within 7 days, they're probably following up to schedule
    if (isShortPing(lastMessage) && daysSinceClose <= 7) {
      // Actually engage - they're likely ready to book!
      return {
        shouldSkip: false,
        reason: "Short ping after recent scheduling - likely ready to book",
      };
    }
    
    // If it's been more than 7 days and just a short ping, might skip
    if (isShortPing(lastMessage) && daysSinceClose > 7) {
      return {
        shouldSkip: true,
        reason: `Short ping ${daysSinceClose} days after scheduled meeting`,
      };
    }
  }
  
  // For my_close (actual rejection/close), be stricter
  if (closeState.closeType === "my_close") {
    // If it's a short ping during cooldown, skip
    if (isShortPing(lastMessage) && isWithinCooldown) {
      return {
        shouldSkip: true,
        reason: `Short ping during close cooldown (${daysSinceClose} days ago)`,
      };
    }
  }
  
  // If within cooldown and message is a simple acknowledgment (not a question)
  if (isWithinCooldown) {
    const hasQuestion = lastMessage.includes("?");
    const wordCount = lastMessage.split(/\s+/).length;
    
    // Skip short acks without questions during cooldown
    if (!hasQuestion && wordCount <= 5) {
      return {
        shouldSkip: true,
        reason: `Short acknowledgment during ${closeState.closeType === "pending_meeting" ? "pending meeting" : "close"} cooldown`,
      };
    }
  }
  
  // If they're asking a real question or sending substantial content, engage
  if (lastMessage.includes("?") || lastMessage.split(/\s+/).length > 10) {
    return {
      shouldSkip: false,
      reason: "Substantive message or question - engage",
    };
  }
  
  return { shouldSkip: false, reason: "" };
}

function isShortAckNoQuestion(msg: string): boolean {
  const t = msg.toLowerCase().trim();
  if (t.includes("?")) return false;
  return t.split(" ").length <= 3;
}

function headlineIsIrrelevant(headline: string): boolean {
  if (!headline || headline === "Unknown") return true;
  const lower = headline.toLowerCase();
  return HEADLINE_BLACKLIST.some((w) => lower.includes(w));
}

async function fetchReply(
  apiKey: string,
  prompt: string,
  fullHistory: MessageEntry[],
  leadName: string,
  myName: string,
  leadProfile: any,
  useGroqAPI: boolean = false,
  groqModelName: string = "llama-3.3-70b-versatile"
): Promise<{ reply: string; tokensUsed: number }> {
  const recentMessages = fullHistory.slice(-30);
  const conversationText = recentMessages.map((msg) => `${msg.speaker}: ${msg.content}`).join("\n");
  const timeContext = getTimeContext();
  const conversationAge = getConversationAge(fullHistory);
  const responsePattern = getResponsePattern(fullHistory);
  const toneGuidance = getToneGuidance(leadProfile);
  const profileContext = leadProfile ? `\n\nLEAD PROFILE:\n${formatProfileForAI(leadProfile)}\n` : "";
  const userPrompt = prompt
    .replace("{extracted_text}", conversationText)
    .replace("{user_name}", leadName)
    .replace("{lead_headline}", leadProfile?.headline || "Unknown");
  const systemPrompt = `You are a real professional messaging on LinkedIn (NOT an AI assistant).
${profileContext}
TIME CONTEXT: ${timeContext}
CONVERSATION AGE: ${conversationAge}
THEIR MESSAGING STYLE: ${responsePattern}
TONE ADJUSTMENT: ${toneGuidance}

CONVERSATION (${fullHistory.length} total messages, showing last ${recentMessages.length}):
${conversationText}

USER'S INSTRUCTIONS:
${userPrompt}

CRITICAL REALISM RULES:
1. LENGTH: 15-30 words. Real people are busy.
2. TONE: Match their energy. If they write 5 words, you write 7-10.
3. NATURAL: Use contractions (I'm, we're, that's). Be conversational.
4. QUESTIONS: Max ONE follow-up question.
5. AVOID AI PATTERNS:
   - "Thank you for reaching out"
   - "I hope this finds you well"
   - "I'd be happy to..."
   - Corporate jargon
   - Over-enthusiasm (!!!)

Respond as ${myName}. Type like you're between meetings.`;

  const apiUrl = useGroqAPI
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model = useGroqAPI ? groqModelName : "gpt-4o-mini";
  let maxTokens = 150;
  if (useGroqAPI) {
    if (groqModelName === "openai/gpt-oss-120b") maxTokens = 500;
    else maxTokens = 250;
  }
  const response = await fetchWithBackoff(
    () =>
      fetch(apiUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...recentMessages.map((msg) => ({
              role: msg.type === "received" ? "user" : "assistant",
              content: msg.content,
            })),
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
        }),
      }),
    3,
    1000
  );
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`${useGroqAPI ? "Groq" : "OpenAI"} API Error ${response.status}: ${bodyText.slice(0, 500)}`);
  }
  const data = await response.json();
  const tokensUsed = (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0);
  return {
    reply: data.choices[0].message.content.trim(),
    tokensUsed,
  };
}

function getTimeContext(): string {
  const hour = new Date().getHours();
  const day = new Date().getDay();
  if (day === 0 || day === 6) return "Weekend - keep it casual and light";
  if (hour < 12) return "Morning - people are busy, be concise";
  if (hour < 17) return "Afternoon - normal business hours";
  return "Evening - they might not respond until tomorrow";
}

function getConversationAge(messages: MessageEntry[]): string {
  if (messages.length < 2) return "First exchange - establish rapport";
  const firstMsg = messages[0].timestamp;
  const daysSince = Math.floor((Date.now() - firstMsg) / (1000 * 60 * 60 * 24));
  if (daysSince === 0) return "New conversation today";
  if (daysSince === 1) return "Ongoing conversation";
  if (daysSince > 7) return "Old conversation - re-engage carefully";
  return `${daysSince}-day conversation`;
}

function getResponsePattern(messages: MessageEntry[]): string {
  const theirMessages = messages.filter((m) => m.type === "received");
  if (theirMessages.length === 0) return "Unknown";
  const avgLength =
    theirMessages.reduce((sum: number, m: MessageEntry) => sum + m.content.split(" ").length, 0) / theirMessages.length;
  if (avgLength < 10) return "SHORT replies (5-10 words) - match that brevity";
  if (avgLength < 25) return "MEDIUM replies (10-25 words) - similar length";
  return "LONG replies (25+ words) - you can elaborate more";
}

function getToneGuidance(profile: any): string {
  if (!profile || !profile.jobTitle) return "Professional but friendly";
  const title = profile.jobTitle.toLowerCase();
  if (title.includes("ceo") || title.includes("founder") || title.includes("president")) {
    return "EXECUTIVE - Be direct, concise, value-focused. No fluff.";
  }
  if (title.includes("director") || title.includes("vp") || title.includes("head")) {
    return "SENIOR LEADER - Professional, strategic. Focus on ROI.";
  }
  if (title.includes("engineer") || title.includes("developer")) {
    return "TECHNICAL - Be specific, mention features. Avoid sales speak.";
  }
  return "PROFESSIONAL - Warm, helpful, consultative.";
}

function getMyName(): string {
  const nameEl = document.querySelector(".global-nav__me-content span") as HTMLElement;
  return nameEl?.textContent?.trim() || "You";
}

function getModelDisplayName(modelId: string): string {
  const modelNames: Record<string, string> = {
    "openai/gpt-oss-120b": "GPT-OSS-120B",
    "llama-3.3-70b-versatile": "Llama-3.3-70B",
    "meta-llama/llama-4-scout-17b-16e-instruct": "Llama-4-Scout",
    "meta-llama/llama-4-maverick-17b-128e-instruct": "Llama-4-Maverick",
    "moonshotai/kimi-k2-instruct-0905": "Kimi-K2",
    "qwen/qwen3-32b": "Qwen-3-32B",
    "gpt-4o-mini": "GPT-4o-mini",
    "gpt-4o": "GPT-4o",
  };
  return modelNames[modelId] || modelId;
}

function getProviderDisplayName(provider: AIProvider): string {
  return provider === "groq" ? "Groq" : "OpenAI";
}

function isBlacklisted(leadName: string, profile: any): boolean {
  const checkStrings = [
    leadName.toLowerCase(),
    profile?.company?.toLowerCase() || "",
    profile?.jobTitle?.toLowerCase() || "",
  ];
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
    chrome.storage.local.set({
      pendingReply: {
        leadName,
        reply,
        timestamp: Date.now(),
      },
    });
    addLog("INFO", `Waiting for approval to reply to ${leadName}...`, "System");
    setTimeout(() => {
      if (pendingReplyResolve) {
        addLog("WARNING", `Reply approval timed out for ${leadName}`, "System");
        pendingReplyResolve({ approved: false, reply: "" });
        pendingReplyResolve = null;
        chrome.storage.local.remove(["pendingReply"]);
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

// --- MAIN LOOP ---
async function runIteration(n: number) {
  addLog("INFO", `Starting batch of ${n} chats...`, "System");

  const {
    apiKey,
    groqApiKey,
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
    decisionProvider,
    leadDetectionProvider,
  } = await getSettings();

  const replyApiKey = getApiKeyForProvider(replyProvider, apiKey, groqApiKey);
  const decisionApiKey = getApiKeyForProvider(decisionProvider, apiKey, groqApiKey);
  const leadDetectionApiKey = getApiKeyForProvider(leadDetectionProvider, apiKey, groqApiKey);

  const currentModelName = replyProvider === "groq" ? groqModel : "gpt-4o-mini";
  updateStats("currentModel", getModelDisplayName(currentModelName));

  const storageData = await chrome.storage.local.get(["blacklist"]);
  blacklist = storageData.blacklist || [];

  if (useStrictHours && !isWithinWorkingHours(startHour, endHour)) {
    addLog("WARNING", `Outside working hours (${startHour}-${endHour}). Pausing.`, "System");
    if (botRunning && !botPaused) {
      botLoopTimeout = window.setTimeout(() => runIteration(n), 15 * 60 * 1000);
    }
    return;
  }

  const myName = getMyName();
  await scrollConversationList(5);

  let chats = Array.from(document.querySelectorAll("ul.msg-conversations-container__conversations-list li"))
    .slice(0, n)
    .sort(() => Math.random() - 0.2);

  addLog("INFO", `Found ${chats.length} conversations to check.`, "Bot");

  for (let i = 0; i < chats.length && botRunning; i++) {
    while (botPaused && botRunning) {
      await delay(1000);
    }
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

    const fullConversation = await getOrCreateConversationHistory(leadName);

    // Check conversation close state FIRST
    const closeState = getConversationCloseState(fullConversation.messages);
    if (closeState.isClosed) {
      const skipCheck = shouldSkipDueToCloseState(closeState, lastMsg.content);
      if (skipCheck.shouldSkip) {
        addLog(
          "INFO",
          `Skipping ${leadName}: ${skipCheck.reason} [${closeState.closeType}]`,
          "Bot"
        );
        continue;
      }
      // ✅ NEW: Log when we decide NOT to skip despite close state
      if (skipCheck.reason) {
        addLog("INFO", `Engaging ${leadName}: ${skipCheck.reason}`, "Bot");
      }
    }

    // Headline relevance guard
    const headline = fullConversation.profile?.headline || "Unknown";
    if (headlineIsIrrelevant(headline)) {
      if (!lastMsg.content.includes("?") && lastMsg.content.split(" ").length < 12) {
        addLog("INFO", `Skipping ${leadName}: Irrelevant or unknown headline`, "Bot");
        continue;
      }
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

    const recentForDecision = fullConversation.messages
      .slice(-8)
      .map((m: MessageEntry) => ({ speaker: m.speaker, message: m.content }));

    let decision;
    try {
      decision = await shouldReplyToConversation(decisionApiKey, recentForDecision, leadName, decisionProvider);
      addLog(
        "ACTION",
        `AI Decision for ${leadName}: ${decision.shouldReply ? "REPLY" : "SKIP"} (${decision.reason}) [${getProviderDisplayName(decisionProvider)}]`,
        "Bot"
      );
    } catch (e) {
      addLog("ERROR", `AI Decision Failed (${getProviderDisplayName(decisionProvider)}): ${getErrorMsg(e)}`, "System");
      continue;
    }

    if (!decision.shouldReply) continue;

    // Lead detection & webhook
    if (webhookUrl) {
      try {
        const recentMsgs = fullConversation.messages.slice(-2).map((m: MessageEntry) => m.content);
        const isPositive = await checkPositiveLead(leadDetectionApiKey, leadPrompt, recentMsgs, leadDetectionProvider);
        if (isPositive) {
          const conversationHistory = fullConversation.messages
            .map((m: MessageEntry) => `${m.speaker}: ${m.content}`)
            .join("\n");
          const payload: LeadWebhookPayload = {
            leadName,
            profileUrl: fullConversation.profileUrl,
            company: fullConversation.profile?.company || "Unknown",
            jobTitle: fullConversation.profile?.jobTitle || "Unknown",
            headline: fullConversation.profile?.headline || "Unknown",
            conversationHistory,
            messageCount: fullConversation.messages.length,
            detectedAt: new Date().toISOString(),
          };
          await sendLeadWebhook(payload);
          updateStats("leadsFound", 1);
          addLog(
            "SUCCESS",
            `🔥 HOT LEAD: ${leadName} sent to webhook! [${getProviderDisplayName(leadDetectionProvider)}]`,
            "Bot"
          );
        }
      } catch (e) {
        addLog(
          "ERROR",
          `Lead webhook failed (${getProviderDisplayName(leadDetectionProvider)}): ${getErrorMsg(e)}`,
          "System"
        );
      }
    }

    let replyData: { reply: string; tokensUsed: number };
    try {
      replyData = await fetchReply(
        replyApiKey,
        prompt,
        fullConversation.messages,
        leadName,
        myName,
        fullConversation.profile,
        replyProvider === "groq",
        groqModel
      );
      updateStats("tokensUsed", replyData.tokensUsed);
    } catch (e) {
      addLog("ERROR", `Reply Generation Failed (${getProviderDisplayName(replyProvider)}): ${getErrorMsg(e)}`, "System");
      continue;
    }

    let finalReply = replyData.reply;
    if (replyPreviewEnabled) {
      const approval = await waitForReplyApproval(leadName, replyData.reply);
      if (!approval.approved) {
        addLog("INFO", `Reply to ${leadName} was skipped by user`, "User");
        continue;
      }
      finalReply = approval.reply;
    }

    const input = await waitForElement<HTMLElement>("div.msg-form__contenteditable[role='textbox']", 6, 400);
    const sendBtn = await waitForElement<HTMLButtonElement>("button.msg-form__send-button", 6, 400);

    if (input && sendBtn) {
      const conversationMeta = {
        messageCount: fullConversation.messages.length,
        lastMessageQuestions:
          (fullConversation.messages[fullConversation.messages.length - 1]?.content.match(/\?/g) || [])
            .length,
      };

      const shouldSplit = shouldDoubleText(finalReply, conversationMeta);
      const doubleTextPattern = shouldSplit ? generateDoubleText(finalReply, conversationMeta) : null;

      if (doubleTextPattern) {
        addLog("ACTION", `Double-texting ${leadName} (${doubleTextPattern.pattern})...`, "Bot");

        const typingDelay1 = calculateTypingDelay(doubleTextPattern.firstMessage);
        await delay(typingDelay1);
        await setEditableText(input, doubleTextPattern.firstMessage);
        await delay(800);

        if (!sendBtn.hasAttribute("disabled") && !sendBtn.classList.contains("disabled")) {
          sendBtn.click();
          await delay(500);

          const betweenDelay = calculateDoubleTextDelay(doubleTextPattern.pattern);
          addLog("INFO", `Waiting ${Math.round(betweenDelay / 1000)}s before second message...`, "Bot");
          await delay(betweenDelay);

          const typingDelay2 = calculateTypingDelay(doubleTextPattern.secondMessage);
          await delay(typingDelay2);
          await setEditableText(input, doubleTextPattern.secondMessage);
          await delay(800);

          if (!sendBtn.hasAttribute("disabled") && !sendBtn.classList.contains("disabled")) {
            sendBtn.click();
            await delay(500);

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

            addLog(
              "SUCCESS",
              `Double-texted ${formatProfileForDisplay(leadName, fullConversation.profile)} (${getModelDisplayName(currentModelName)}) [History: ${fullConversation.messages.length} msgs]`,
              "Bot"
            );
          } else {
            addLog("ERROR", `Send button disabled for second message to ${leadName}`, "System");
          }
        } else {
          addLog("ERROR", `Send button disabled for ${leadName}`, "System");
        }
      } else {
        const typingDelay = calculateTypingDelay(finalReply);
        addLog("ACTION", `Typing reply to ${leadName} (waiting ${Math.round(typingDelay / 1000)}s)...`, "Bot");
        await delay(typingDelay);

        await setEditableText(input, finalReply);
        await delay(800);

        if (sendBtn.hasAttribute("disabled") || sendBtn.classList.contains("disabled")) {
          addLog("ERROR", `Send button disabled for ${leadName}`, "System");
        } else {
          sendBtn.click();
          await delay(500);

          const inputText = input.textContent?.trim() || "";
          if (inputText.length === 0) {
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

            addLog(
              "SUCCESS",
              `Sent reply to ${formatProfileForDisplay(leadName, fullConversation.profile)} (${getModelDisplayName(currentModelName)}) [History: ${fullConversation.messages.length} msgs]`,
              "Bot"
            );
          } else {
            addLog("WARNING", `Message may not have sent to ${leadName}`, "System");
          }
        }
      }
    } else {
      addLog("ERROR", "Could not find chat input or send button", "System");
    }

    await randomDelay(chatMin, chatMax);
  }

  addLog("INFO", "Batch finished. Sleeping...", "System");

  if (botRunning && !botPaused) {
    botLoopTimeout = window.setTimeout(
      () => runIteration(n),
      Math.floor(Math.random() * (loopMax - loopMin + 1)) + loopMin
    );
  }
}

function randomDelay(min: number, max: number) {
  return delay(Math.floor(Math.random() * (max - min + 1)) + min);
}

function getErrorMsg(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) return (err as any).message;
  return "Unknown error";
}

// --- MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((msg: ContentCommand, _sender, sendResponse) => {
  if (msg.type === "PING_TEST") {
    sendResponse("✅ Content script active!");
    return;
  }

  if (msg.type === "GET_STATUS") {
    const status: BotStatus & { paused: boolean } = {
      running: botRunning,
      paused: botPaused,
      stats,
      logs,
    };
    sendResponse(status);
    return;
  }

  if (msg.type === "START_BOT") {
    if (!botRunning) {
      botRunning = true;
      botPaused = false;
      stats = {
        chatsProcessed: 0,
        repliesSent: 0,
        leadsFound: 0,
        startTime: Date.now(),
        tokensUsed: 0,
        currentModel: "",
      };
      useStrictHours = msg.config?.strictHours ?? true;
      useGroq = msg.config?.useGroq ?? false;
      groqModel = msg.config?.groqModel ?? "llama-3.3-70b-versatile";
      replyPreviewEnabled = (msg as any).config?.replyPreviewEnabled ?? false;
      blacklist = (msg as any).config?.blacklist ?? [];

      addLog(
        "INFO",
        `Bot started (Strict Hours: ${useStrictHours ? "ON" : "OFF"}, Preview: ${replyPreviewEnabled ? "ON" : "OFF"})`,
        "User"
      );
      runIteration(msg.config?.nChats ?? 10);
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

  if (msg.type === "PAUSE_BOT") {
    if (botRunning && !botPaused) {
      botPaused = true;
      addLog("INFO", "Bot paused by user", "User");
      sendResponse({ status: "paused" });
    } else {
      sendResponse({ status: "error", error: "Not running or already paused" });
    }
    return;
  }

  if (msg.type === "RESUME_BOT") {
    if (botRunning && botPaused) {
      botPaused = false;
      addLog("INFO", "Bot resumed by user", "User");
      sendResponse({ status: "running" });
    } else {
      sendResponse({ status: "error", error: "Not paused" });
    }
    return;
  }

  if (msg.type === "APPROVE_REPLY") {
    if (pendingReplyResolve) {
      addLog("SUCCESS", `Reply to ${msg.leadName} approved`, "User");
      pendingReplyResolve({ approved: true, reply: msg.reply });
      pendingReplyResolve = null;
      chrome.storage.local.remove(["pendingReply"]);
    }
    sendResponse({ status: "ok" });
    return;
  }

  if (msg.type === "REJECT_REPLY") {
    if (pendingReplyResolve) {
      addLog("INFO", `Reply to ${msg.leadName} rejected`, "User");
      pendingReplyResolve({ approved: false, reply: "" });
      pendingReplyResolve = null;
      chrome.storage.local.remove(["pendingReply"]);
    }
    sendResponse({ status: "ok" });
    return;
  }

  if (msg.type === "CHECK_UNREAD") {
    if (botRunning && !botPaused) {
      addLog("INFO", "Check unread triggered by background", "System");
    }
    sendResponse({ status: "ok" });
    return;
  }
});