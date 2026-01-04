// src/shared/sendEmail.ts
import { getBotSettings, AIProvider } from "./settings";

// Disengagement patterns for quick checks
const DISENGAGEMENT_PATTERNS = [
  "not interested",
  "no thanks",
  "no thank",
  "not now",
  "too busy",
  "maybe later",
  "not a fit",
  "no overlap",
  "policy",
  "not allowed",
  "stop",
  "unsubscribe",
  "no, thank you",
  "no thank you",
  "no thankyou",
  "nope",
  "nah",
];

const SHORT_ACK_PATTERNS = ["sure", "ok", "okay", "k", "thx", "thanks"];

function getApiUrl(provider: AIProvider): string {
  return provider === "groq"
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
}

function getModelForProvider(provider: AIProvider): string {
  return provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini";
}

// Existing function: Should reply to conversation
export async function shouldReplyToConversation(
  apiKey: string,
  conversation: Array<{ speaker: string; message: string }>,
  leadName: string,
  provider: AIProvider = "openai"
): Promise<{ shouldReply: boolean; reason: string }> {
  if (conversation.length === 0) {
    return { shouldReply: false, reason: "Empty conversation" };
  }

  const lastMessage = conversation[conversation.length - 1];
  const lastMsgLower = lastMessage.message.toLowerCase().trim();

  const theirMessages = conversation.filter((m) => m.speaker !== leadName);
  const myMessages = conversation.filter((m) => m.speaker === leadName);

  // Quick disengagement check
  if (DISENGAGEMENT_PATTERNS.some((p) => lastMsgLower.includes(p))) {
    return { shouldReply: false, reason: "Lead disengaged" };
  }

  // Short ack after close check
  if (SHORT_ACK_PATTERNS.includes(lastMsgLower) && theirMessages.length > 0) {
    const lastTheirMsg = theirMessages[theirMessages.length - 1].message.toLowerCase();
    if (
      lastTheirMsg.includes("no overlap") ||
      lastTheirMsg.includes("reach out if") ||
      lastTheirMsg.includes("feel free to reach out") ||
      lastTheirMsg.includes("not a fit") ||
      lastTheirMsg.includes("no problem") ||
      lastTheirMsg.includes("thanks for letting me know")
    ) {
      return { shouldReply: false, reason: "Ack after close" };
    }
  }

  // Quick positive checks
  const iAskedQuestion = theirMessages.length > 0 && theirMessages[theirMessages.length - 1].message.includes("?");
  const theyResponded = myMessages[myMessages.length - 1] === lastMessage;
  const theirLastIdx = theirMessages.length ? conversation.findIndex((m) => m === theirMessages[theirMessages.length - 1]) : -1;
  const lastIdx = conversation.length - 1;

  if (iAskedQuestion && theyResponded && lastIdx > theirLastIdx) {
    return { shouldReply: true, reason: "They answered my question" };
  }

  const isShortResponse = lastMessage.message.split(" ").length < 20;
  const hasEngagement = theirMessages.length > 0 && myMessages.length > 0;
  if (isShortResponse && hasEngagement && theirMessages.length >= 2) {
    return { shouldReply: true, reason: "Short but engaged response" };
  }

  const positiveSignals = [
    "yes", "yeah", "sure", "absolutely", "definitely", "interested",
    "sounds good", "tell me more", "how does", "what about", "can you",
    "could you", "would love to", "want to know", "curious about", "?"
  ];
  if (positiveSignals.some((s) => lastMsgLower.includes(s))) {
    return { shouldReply: true, reason: "Positive engagement detected" };
  }

  // AI fallback for uncertain cases
  const prompt = `You are analyzing a LinkedIn conversation to decide if a response is needed.

CONVERSATION (last 20 messages):
${conversation.slice(-20).map((m) => `${m.speaker}: ${m.message}`).join("\n")}

CONTEXT: The lead just sent: "${lastMessage.message}"

Rules:
- REPLY if they asked a question, answered my question, or showed interest.
- SKIP if they rejected, said no, not interested, policy/no allowance, or gave a short acknowledgment after my closing message.
- Be biased to REPLY only when there's real engagement; otherwise SKIP.

Respond ONLY with:
REPLY: [one sentence reason]
OR
SKIP: [one sentence reason]`;

  try {
    const apiUrl = getApiUrl(provider);
    const model = getModelForProvider(provider);
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 60,
      }),
    });

    if (!response.ok) {
      console.error(`❌ ${provider.toUpperCase()} API error in shouldReplyToConversation: ${response.status}`);
      return { shouldReply: true, reason: "AI check failed - defaulting to reply" };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    const shouldReply = content.toUpperCase().startsWith("REPLY");
    const reason = content.split(":")[1]?.trim() || "AI decision";

    return { shouldReply, reason };
  } catch (e) {
    console.error("❌ AI decision check failed:", e);
    return { shouldReply: true, reason: "AI error - defaulting to engage" };
  }
}

// ✅ NEW: AI-based engagement decision after close
export async function shouldEngageAfterClose(
  apiKey: string,
  recentMessages: string[],
  closeType: "pending_meeting" | "my_close" | "none",
  daysSinceClose: number,
  provider: AIProvider = "openai"
): Promise<{ shouldEngage: boolean; reason: string }> {
  
  // Quick check: if no messages, skip
  if (recentMessages.length === 0) {
    return { shouldEngage: false, reason: "No messages to evaluate" };
  }

  const combinedMessages = recentMessages.join(" ").toLowerCase();
  
  // Quick check: obvious question mark = engage
  if (combinedMessages.includes("?")) {
    return { shouldEngage: true, reason: "Message contains a question" };
  }

  // Quick check: substantial content = engage
  if (combinedMessages.split(/\s+/).length > 15) {
    return { shouldEngage: true, reason: "Substantial message content" };
  }

  // For pending meetings within 7 days, be more lenient
  if (closeType === "pending_meeting" && daysSinceClose <= 7) {
    // AI decides if they're following up to schedule
    const prompt = `You are analyzing LinkedIn messages to decide if we should RESPOND.

CONTEXT: 
- We sent a scheduling link previously
- They confirmed interest and we have a pending meeting
- It's been ${daysSinceClose} day(s) since they confirmed
- They just sent these messages:

${recentMessages.map((m, i) => `${i + 1}. "${m}"`).join("\n")}

QUESTION: Are they following up to schedule, asking a question, or showing engagement?

Consider:
- Casual questions like "how about you?" or "and you?" = ENGAGE
- Greetings followed by "hope you're doing well" type messages = ENGAGE
- Simple "hi" or "hey" with nothing else = might be SKIP
- Any question, even casual = ENGAGE

Reply with ONLY:
ENGAGE: [brief reason]
OR
SKIP: [brief reason]`;

    try {
      const apiUrl = getApiUrl(provider);
      const model = getModelForProvider(provider);
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 50,
        }),
      });

      if (!response.ok) {
        console.error(`❌ ${provider.toUpperCase()} API error: ${response.status}`);
        return { shouldEngage: true, reason: "AI check failed - defaulting to engage" };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim() || "";
      const shouldEngage = content.toUpperCase().startsWith("ENGAGE");
      const reason = content.split(":")[1]?.trim() || "AI decision";

      return { shouldEngage, reason };
    } catch (e) {
      console.error("❌ Engagement check failed:", e);
      return { shouldEngage: true, reason: "AI error - defaulting to engage" };
    }
  }

  // For old closes (>7 days) or my_close, be stricter
  if (closeType === "my_close" || daysSinceClose > 7) {
    // Only engage if they have a real question or substantial content
    const wordCount = combinedMessages.split(/\s+/).length;
    if (wordCount <= 5) {
      return { shouldEngage: false, reason: `Short message during cooldown (${daysSinceClose} days)` };
    }
  }

  return { shouldEngage: true, reason: "Default to engage" };
}

// Existing function: Check positive lead
export async function checkPositiveLead(
  apiKey: string,
  leadPrompt: string,
  recentMessages: string[],
  provider: AIProvider = "openai"
): Promise<boolean> {
  const prompt = `You are an AI assistant helping identify qualified leads.
Rule: ${leadPrompt}
Analyze the following two LinkedIn messages: ${recentMessages.join("\n")}
Respond with only one word: "yes" or "no".`;

  try {
    const apiUrl = getApiUrl(provider);
    const model = getModelForProvider(provider);
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      console.error(`❌ ${provider.toUpperCase()} API error in checkPositiveLead: ${response.status}`);
      return false;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim().toLowerCase() === "yes";
  } catch (e) {
    console.error("❌ GPT lead check failed:", e);
    return false;
  }
}

// Lead webhook payload type
export interface LeadWebhookPayload {
  leadName: string;
  profileUrl: string;
  company: string;
  jobTitle: string;
  headline: string;
  conversationHistory: string;
  messageCount: number;
  detectedAt: string;
}

// Existing function: Send lead webhook
export async function sendLeadWebhook(payload: LeadWebhookPayload): Promise<void> {
  const { webhookUrl } = await getBotSettings();

  if (!webhookUrl || webhookUrl.trim().length === 0) {
    throw new Error("Webhook URL is not configured. Please set it in Options.");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    console.error("❌ Webhook error:", errText);
    throw new Error(`Webhook error: ${response.status}`);
  }

  console.log("✅ Lead sent to webhook successfully");
}