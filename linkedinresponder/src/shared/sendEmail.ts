// linkedinresponder/src/shared/sendEmail.ts

import { getBotSettings } from "./settings";

// ✅ UPDATED: Smart skip logic with rule-based decision making
export async function shouldReplyToConversation(
  apiKey: string,
  conversation: Array<{ speaker: string; message: string }>,
  leadName: string
): Promise<{ shouldReply: boolean; reason: string }> {
  if (conversation.length === 0) {
    return { shouldReply: false, reason: "Empty conversation" };
  }

  const lastMessage = conversation[conversation.length - 1];
  const lastMessageText = lastMessage.message.toLowerCase();

  // Get all messages from the bot (not the lead)
  const myMessages = conversation.filter((msg) => msg.speaker !== leadName);
  const theirMessages = conversation.filter((msg) => msg.speaker === leadName);

  // ✅ RULE 1: Never skip if they just answered YOUR question
  if (myMessages.length > 0) {
    const myLastMessage = myMessages[myMessages.length - 1];
    const myLastWasQuestion = myLastMessage.message.includes("?");
    const theirLastIsAnswer = theirMessages[theirMessages.length - 1] === lastMessage;

    const myLastIndex = conversation.findIndex((msg) => msg === myLastMessage);
    const theirLastIndex = conversation.length - 1;

    if (myLastWasQuestion && theirLastIsAnswer && theirLastIndex > myLastIndex) {
      return {
        shouldReply: true,
        reason: "They answered my question - must acknowledge and continue",
      };
    }
  }

  // ✅ RULE 2: Never skip on short answers if conversation is active
  const isShortAnswer = lastMessage.message.split(" ").length < 20;
  const hasRecentExchange = myMessages.length > 0 && theirMessages.length > 0;

  if (isShortAnswer && hasRecentExchange && myMessages.length >= 2) {
    return {
      shouldReply: true,
      reason: "Short but engaged response - continuing conversation flow",
    };
  }

  // ✅ RULE 3: Only skip on explicit disengagement phrases
  const disengagementPhrases = [
    "not interested",
    "no thanks",
    "not right now",
    "too busy right now",
    "maybe later",
    "not a fit",
    "not looking",
    "thanks but no",
    "appreciate it but",
    "not what we need",
    "have a great day",
    "talk soon",
    "take care",
    "bye",
    "goodbye",
    "gotta go",
    "catch you later",
  ];

  const hasDisengagement = disengagementPhrases.some((phrase) => lastMessageText.includes(phrase));
  if (hasDisengagement) {
    return {
      shouldReply: false,
      reason: "Lead explicitly disengaged or ended conversation",
    };
  }

  // ✅ Check for positive engagement signals
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
    "?", // Questions are engagement
  ];

  const hasEngagement = engagementSignals.some((signal) => lastMessageText.includes(signal));
  if (hasEngagement) {
    return {
      shouldReply: true,
      reason: "Positive engagement detected - they're interested",
    };
  }

  // ✅ RULE 4: Use AI as fallback for complex cases
  const conversationText = conversation
    .slice(-20)
    .map((msg) => `${msg.speaker}: ${msg.message}`)
    .join("\n");

  const decisionPrompt = `You are analyzing a LinkedIn conversation to decide if a response is needed.

CONVERSATION (last 20 messages):
${conversationText}

CONTEXT: The lead just sent: "${lastMessage.message}"

Analyze if you should reply:

REPLY if:
- They asked a question (even indirectly)
- They shared useful information expecting feedback
- They answered YOUR question and conversation should continue
- They showed interest or curiosity
- Natural conversation flow requires acknowledgment

SKIP ONLY if:
- They gave a hard "no" or clear rejection
- They said goodbye and closed the conversation
- They gave a pure acknowledgment with no follow-up needed (like "ok thanks")
- Replying would seem pushy after their closure statement

Respond ONLY with this format:
REPLY: [one sentence reason]
OR
SKIP: [one sentence reason]

Be biased toward REPLY unless there's clear disengagement.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: decisionPrompt }],
        temperature: 0.2,
        max_tokens: 60,
      }),
    });

    if (!res.ok) {
      return {
        shouldReply: true,
        reason: "AI check failed - defaulting to reply",
      };
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "";

    const shouldReply = reply.toUpperCase().startsWith("REPLY");
    const reason = reply.split(":")[1]?.trim() || "AI decision";

    return { shouldReply, reason };
  } catch (err) {
    console.error("❌ AI decision check failed:", err);
    return {
      shouldReply: true,
      reason: "AI error - defaulting to engage",
    };
  }
}

export async function checkPositiveLead(
  apiKey: string,
  leadPrompt: string,
  lastTwoMessages: string[]
): Promise<boolean> {
  const prompt = `You are an AI assistant helping identify qualified leads.
Rule: ${leadPrompt}
Analyze the following two LinkedIn messages: ${lastTwoMessages.join("\n")}
Respond with only one word: "yes" or "no".`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 10,
      }),
    });

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim().toLowerCase();
    return reply === "yes";
  } catch (err) {
    console.error("❌ GPT lead check failed:", err);
    return false;
  }
}

// ✅ Send email using Resend REST API (reads key from settings instead of hardcoding)
export async function sendLeadAlertEmail(leadName: string, conversation: string, recipientEmail: string) {
  const { resendApiKey } = await getBotSettings();

  if (!resendApiKey || resendApiKey.trim().length === 0) {
    // Keep behavior safe: if no key configured, don't send and surface a clear error
    throw new Error("Resend API key is not set in Options. Please configure resendApiKey.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "LinkedIn AI Bot <onboarding@resend.dev>",
      to: [recipientEmail],
      subject: `🔥 Hot Lead: ${leadName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #0066cc; border-bottom: 3px solid #0066cc; padding-bottom: 10px;">
            🎯 New Qualified Lead Alert
          </h1>

          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-top: 0;">Lead Name</h2>
            <p style="font-size: 18px; font-weight: bold; color: #0066cc;">${leadName}</p>
          </div>

          <div style="background: white; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
            <h2 style="color: #333;">Conversation History</h2>
            <div style="white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.6; background: #f9f9f9; padding: 15px; border-left: 4px solid #0066cc; overflow-x: auto;">
${conversation}
            </div>
          </div>

          <div style="margin-top: 30px; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; text-align: center;">
            <h3 style="margin: 0 0 10px 0;">Next Steps</h3>
            <p style="margin: 0; font-size: 14px;">
              Review the conversation and follow up with <strong>${leadName}</strong> on LinkedIn.
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px;">
            <p>Sent by LinkedIn AI Responder</p>
            <p>Automated lead notification system</p>
          </div>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    console.error("❌ Resend API error:", errorData);
    throw new Error(`Resend API error: ${response.status}`);
  }

  const data = await response.json();
  console.log("✅ Email sent via Resend:", data);
  return data;
}