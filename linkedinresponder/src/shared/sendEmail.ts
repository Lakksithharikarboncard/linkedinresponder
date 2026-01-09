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

// UPDATED: Added Routeway support
async function getModelForProvider(provider: AIProvider): Promise<string> {
    const settings = await getBotSettings();
    if (provider === "groq") return settings.groqModel;
    if (provider === "routeway") return settings.routewayModel;
    return settings.openaiModel;
}

// UPDATED: Added Routeway support - Unified helper to make AI calls
async function makeAICall(
    apiKey: string,
    prompt: string,
    provider: AIProvider,
    maxTokens: number = 60
): Promise<string> {
    const model = await getModelForProvider(provider);

    if (provider === "groq") {
        // Groq: Use Chat Completions API
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: prompt }],
                max_tokens: maxTokens,
                temperature: 0.2,
            }),
        });

        if (!response.ok) {
            throw new Error(`Groq API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || "";
    } else if (provider === "routeway") {
        // NEW: Routeway - Use Chat Completions API (OpenAI-compatible)
        const response = await fetch("https://api.routeway.ai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: prompt }],
                max_tokens: maxTokens,
                temperature: 0.2,
            }),
        });

        if (!response.ok) {
            throw new Error(`Routeway API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || "";
    } else {
        // OpenAI: Use new Responses API for GPT-5/GPT-4.1 models
        const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                input: prompt,
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();

        // Extract text from Responses API format
        if (data.output_text) {
            return data.output_text.trim();
        }

        if (data.output && Array.isArray(data.output)) {
            for (const item of data.output) {
                if (item.type === "message" && item.content) {
                    for (const contentItem of item.content) {
                        if (contentItem.type === "output_text" && contentItem.text) {
                            return contentItem.text.trim();
                        }
                    }
                }
            }
        }

        return "";
    }
}

// AI-based engagement decision after close
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
            const content = await makeAICall(apiKey, prompt, provider, 50);
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
        const wordCount = combinedMessages.split(/\s+/).length;
        if (wordCount <= 5) {
            return { shouldEngage: false, reason: `Short message during cooldown (${daysSinceClose} days)` };
        }
    }

    return { shouldEngage: true, reason: "Default to engage" };
}

// Check positive lead
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
        const content = await makeAICall(apiKey, prompt, provider, 10);
        return content.toLowerCase() === "yes";
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

// Send lead webhook
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
