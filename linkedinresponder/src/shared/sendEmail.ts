// linkedinresponder/src/shared/sendEmail.ts
import { getBotSettings, AIProvider } from "./settings";

const DISENGAGEMENT = [
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
  "nah"
];

const SHORT_ACK = ["sure", "ok", "okay", "k", "thx", "thanks"];

// API endpoint helper
function getApiEndpoint(provider: AIProvider): string {
  return provider === "groq"
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
}

// Model helper - uses smaller/faster models for decision tasks
function getDecisionModel(provider: AIProvider): string {
  return provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini";
}

// --- Decision: Should reply? ---
export async function shouldReplyToConversation(
  apiKey: string,
  conversation: Array<{ speaker: string; message: string }>,
  leadName: string,
  provider: AIProvider = "openai"
): Promise<{ shouldReply: boolean; reason: string }> {
  if (conversation.length === 0) return { shouldReply: false, reason: "Empty conversation" };

  const lastMessage = conversation[conversation.length - 1];
  const lastMessageText = lastMessage.message.toLowerCase().trim();

  const myMessages = conversation.filter((msg) => msg.speaker !== leadName);
  const theirMessages = conversation.filter((msg) => msg.speaker === leadName);

  // Hard disengagement
  if (DISENGAGEMENT.some((p) => lastMessageText.includes(p))) {
    return { shouldReply: false, reason: "Lead disengaged" };
  }

  // Short ack after my close
  if (SHORT_ACK.includes(lastMessageText) && myMessages.length > 0) {
    const myLast = myMessages[myMessages.length - 1].message.toLowerCase();
    const looksLikeClose =
      myLast.includes("no overlap") ||
      myLast.includes("reach out if") ||
      myLast.includes("feel free to reach out") ||
      myLast.includes("not a fit") ||
      myLast.includes("no problem") ||
      myLast.includes("thanks for letting me know");
    if (looksLikeClose) {
      return { shouldReply: false, reason: "Ack after close" };
    }
  }

  // Rule: they answered my question
  const myLastWasQuestion = myMessages.length > 0 && myMessages[myMessages.length - 1].message.includes("?");
  const theirLastIsAnswer = theirMessages[theirMessages.length - 1] === lastMessage;
  const myLastIndex = myMessages.length ? conversation.findIndex((msg) => msg === myMessages[myMessages.length - 1]) : -1;
  const theirLastIndex = conversation.length - 1;
  if (myLastWasQuestion && theirLastIsAnswer && theirLastIndex > myLastIndex) {
    return { shouldReply: true, reason: "They answered my question" };
  }

  // Short answer but engaged flow
  const isShortAnswer = lastMessage.message.split(" ").length < 20;
  const hasRecentExchange = myMessages.length > 0 && theirMessages.length > 0;
  if (isShortAnswer && hasRecentExchange && myMessages.length >= 2) {
    return { shouldReply: true, reason: "Short but engaged response" };
  }

  // Positive engagement signals
  const engagementSignals = [
    "yes",
    "yeah",
    "sure",
    "absolutely",
    "definitely",
    "interested",
    "sounds good",
    "tell me more",
    "how does",
    "what about",
    "can you",
    "could you",
    "would love to",
    "want to know",
    "curious about",
    "?"
  ];
  const hasEngagement = engagementSignals.some((signal) => lastMessageText.includes(signal));
  if (hasEngagement) {
    return { shouldReply: true, reason: "Positive engagement detected" };
  }

  // AI fallback
  const conversationText = conversation
    .slice(-20)
    .map((msg) => `${msg.speaker}: ${msg.message}`)
    .join("\n");

  const decisionPrompt = `You are analyzing a LinkedIn conversation to decide if a response is needed.

CONVERSATION (last 20 messages):
${conversationText}

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
    const apiUrl = getApiEndpoint(provider);
    const model = getDecisionModel(provider);

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: decisionPrompt }],
        temperature: 0.2,
        max_tokens: 60,
      }),
    });

    if (!res.ok) {
      console.error(`❌ ${provider.toUpperCase()} API error in shouldReplyToConversation: ${res.status}`);
      return { shouldReply: true, reason: "AI check failed - defaulting to reply" };
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "";
    const shouldReply = reply.toUpperCase().startsWith("REPLY");
    const reason = reply.split(":")[1]?.trim() || "AI decision";
    return { shouldReply, reason };
  } catch (err) {
    console.error("❌ AI decision check failed:", err);
    return { shouldReply: true, reason: "AI error - defaulting to engage" };
  }
}

// --- Lead qualification ---
export async function checkPositiveLead(
  apiKey: string,
  leadPrompt: string,
  lastTwoMessages: string[],
  provider: AIProvider = "openai"
): Promise<boolean> {
  const prompt = `You are an AI assistant helping identify qualified leads.
Rule: ${leadPrompt}
Analyze the following two LinkedIn messages: ${lastTwoMessages.join("\n")}
Respond with only one word: "yes" or "no".`;

  try {
    const apiUrl = getApiEndpoint(provider);
    const model = getDecisionModel(provider);

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 10,
      }),
    });

    if (!res.ok) {
      console.error(`❌ ${provider.toUpperCase()} API error in checkPositiveLead: ${res.status}`);
      return false;
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim().toLowerCase();
    return reply === "yes";
  } catch (err) {
    console.error("❌ GPT lead check failed:", err);
    return false;
  }
}

// --- Lead Webhook Payload Type ---
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

// --- Send lead data to Zapier webhook ---
export async function sendLeadWebhook(payload: LeadWebhookPayload): Promise<void> {
  const { webhookUrl } = await getBotSettings();
  
  if (!webhookUrl || webhookUrl.trim().length === 0) {
    throw new Error("Webhook URL is not configured. Please set it in Options.");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    console.error("❌ Webhook error:", errorText);
    throw new Error(`Webhook error: ${response.status}`);
  }

  console.log("✅ Lead sent to webhook successfully");
}