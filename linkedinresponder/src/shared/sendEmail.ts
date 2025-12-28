// ✅ NEW: AI decides if reply is needed
export async function shouldReplyToConversation(
  apiKey: string,
  conversation: Array<{ speaker: string; message: string }>,
  leadName: string
): Promise<{ shouldReply: boolean; reason: string }> {
  
  const conversationText = conversation
    .slice(-8) // Last 8 messages for context
    .map(msg => `${msg.speaker}: ${msg.message}`)
    .join("\n");

  const decisionPrompt = `You are an AI assistant analyzing LinkedIn conversations to decide if a response is appropriate.

CONVERSATION CONTEXT:
${conversationText}

ANALYZE and determine if "${leadName}" needs a response based on these rules:

REPLY if:
- They asked a question
- They shared information expecting feedback
- Conversation is ongoing and natural to continue
- They expressed interest in something you mentioned
- They're waiting for your input or decision

DO NOT REPLY if:
- They said goodbye/thanks and closed conversation (e.g., "thanks, bye!", "talk soon!", "have a great day")
- They gave a simple acknowledgment (e.g., "ok", "got it", "sounds good")
- Conversation naturally concluded
- They didn't ask anything or expect a response
- Replying would seem pushy or forced
- They're clearly ending the chat

Respond with ONLY ONE WORD followed by a brief reason:
Format: REPLY: [reason] OR SKIP: [reason]

Example responses:
- "REPLY: They asked about pricing"
- "SKIP: They said thanks and goodbye"
- "REPLY: They want to schedule a call"
- "SKIP: Conversation naturally ended"`;

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
        temperature: 0.3,
        max_tokens: 50,
      }),
    });

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "";
    
    const shouldReply = reply.toUpperCase().startsWith("REPLY");
    const reason = reply.split(":")[1]?.trim() || "AI decision";

    return { shouldReply, reason };
  } catch (err) {
    console.error("❌ AI decision check failed:", err);
    return { shouldReply: false, reason: "Error in decision making" };
  }
}

// Existing lead check function (upgraded to gpt-4o-mini)
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

// ✅ NEW: Send email using Resend REST API
export async function sendLeadAlertEmail(
  leadName: string,
  conversation: string,
  recipientEmail: string
) {
  const RESEND_API_KEY = "re_V2cc9Nqe_2QaLJuLneRiYKEHAnmFGaEc2"; // Your Resend API key

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "LinkedIn AI Bot <onboarding@resend.dev>", // ✅ Change to your verified domain
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
      const errorData = await response.json();
      console.error("❌ Resend API error:", errorData);
      throw new Error(`Resend API error: ${response.status}`);
    }

    const data = await response.json();
    console.log("✅ Email sent via Resend:", data);
    return data;
  } catch (error) {
    console.error("❌ Email send failed:", error);
    throw error;
  }
}