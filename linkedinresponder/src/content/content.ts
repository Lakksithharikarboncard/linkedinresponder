import { BotCommand, BotLogEntry } from "../shared/types";
import { checkPositiveLead, sendLeadAlertEmail, shouldReplyToConversation } from "../shared/sendEmail";

// Extend BotCommand to include ping and unread check
type ContentCommand =
  | BotCommand
  | { type: "PING_TEST" }
  | { type: "CHECK_UNREAD" };

let botRunning = false;
let botLoopTimeout: number | null = null;

function getErrorMsg(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) return (err as any).message;
  return "Unknown error";
}

function logAction(type: string, detail?: any) {
  chrome.storage.local.get(["botLog"], (res) => {
    const log: BotLogEntry[] = res.botLog || [];
    log.unshift({ time: Date.now(), type, detail });
    chrome.storage.local.set({ botLog: log.slice(0, 50) });
  });
}

function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

function randomDelay(min: number, max: number) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(ms);
}

async function humanType(input: HTMLElement, text: string) {
  input.focus();
  document.execCommand("selectAll", false, "");
  document.execCommand("delete", false, "");
  for (const char of text) {
    document.execCommand("insertText", false, char);
    await delay(50 + Math.random() * 150);
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
  const container = document.querySelector<HTMLElement>('.msg-conversations-container--inbox-shortcuts');
  if (!container) {
    console.warn("Conversation container not found");
    return;
  }

  for (let i = 0; i < times; i++) {
    const scrollDown = Math.random() * 200 + 100;
    container.scrollBy({ top: scrollDown, behavior: 'smooth' });
    await delay(500 + Math.random() * 800);
    const scrollUp = Math.random() * 50;
    container.scrollBy({ top: -scrollUp, behavior: 'smooth' });
    await delay(400 + Math.random() * 500);
  }
}

async function getSettings(): Promise<{
  apiKey: string;
  chatMin: number;
  chatMax: number;
  loopMin: number;
  loopMax: number;
  prompt: string;
  leadPrompt: string;
  targetEmail: string;
}> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        "openaiApiKey",
        "chatMinDelay",
        "chatMaxDelay",
        "loopMinDelay",
        "loopMaxDelay",
        "replyPrompt",
        "leadPrompt",
        "targetEmail",
      ],
      (res) =>
        resolve({
          apiKey: res.openaiApiKey,
          chatMin: res.chatMinDelay || 1000,
          chatMax: res.chatMaxDelay || 2500,
          loopMin: res.loopMinDelay || 3000,
          loopMax: res.loopMaxDelay || 6000,
          prompt: res.replyPrompt || "Reply briefly and professionally to this LinkedIn message:",
          leadPrompt: res.leadPrompt || "Does the user seem interested or did they share contact details?",
          targetEmail: res.targetEmail || "",
        })
    );
  });
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

// ✅ Enhanced: Get structured conversation with speaker labels
function getStructuredConversation(): Array<{ speaker: string; message: string }> {
  const events = Array.from(document.querySelectorAll("li.msg-s-message-list__event"));
  const conversation: Array<{ speaker: string; message: string }> = [];

  for (const msgEl of events) {
    const senderEl = msgEl.querySelector("span.msg-s-message-group__name");
    const contentEl = msgEl.querySelector("p.msg-s-event-listitem__body");
    
    if (senderEl && contentEl) {
      const speaker = senderEl.textContent?.trim() || "Unknown";
      const message = contentEl.textContent?.trim() || "";
      
      if (message) {
        conversation.push({ speaker, message });
      }
    }
  }

  return conversation;
}

function getFullChat(): string {
  const ul = document.querySelector("ul.msg-s-message-list-content");
  if (!ul) return "";
  return Array.from(ul.children)
    .map((li) => li.textContent?.replace(/\s+/g, " ").trim() || "")
    .filter(Boolean)
    .join("\n");
}

// ✅ UPGRADED: More natural, context-aware AI reply generation
async function fetchReply(
  apiKey: string,
  prompt: string,
  conversation: Array<{ speaker: string; message: string }>,
  leadName: string,
  myName: string = "You"
): Promise<string> {
  
  // Build conversation history for better context
  const conversationText = conversation
    .map(msg => `${msg.speaker}: ${msg.message}`)
    .join("\n");

  // Enhanced system prompt for more human-like responses
  const enhancedSystemPrompt = `You are a professional LinkedIn user having a natural conversation. 

IMPORTANT RULES:
- Write like a real person, not a formal AI assistant
- Keep responses brief (1-3 sentences max)
- Match the tone and formality of the conversation
- Use casual language when appropriate (e.g., "sounds great!", "happy to help")
- Avoid corporate jargon and robotic phrases like "I hope this message finds you well"
- Don't use excessive emojis unless the other person does
- Reference specific details from the conversation to show you're paying attention
- Ask follow-up questions when natural
- Use contractions (I'm, you're, that's) to sound more natural

Current conversation context:
${conversationText}

${prompt.replace("{extracted_text}", conversationText).replace("{user_name}", leadName)}

Respond as ${myName} in a natural, conversational way.`;

  // Use conversation history as messages for better context
  const messages = [
    { role: "system", content: enhancedSystemPrompt },
    ...conversation.slice(-10).map(msg => ({
      role: msg.speaker === leadName ? "user" : "assistant",
      content: msg.message
    }))
  ];

  const body = {
    model: "gpt-4o-mini", // ✅ CHANGED: Much cheaper and faster!
    messages: messages,
    max_tokens: 150, // ✅ Shorter for more concise replies
    temperature: 0.7, // ✅ Higher for more natural variation
    presence_penalty: 0.6, // ✅ Reduces repetition
    frequency_penalty: 0.3, // ✅ Encourages variety
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${apiKey}`, 
      "Content-Type": "application/json" 
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

function cleanChat(chat: string): string {
  return chat
    .split('\n')
    .map(line =>
      line
        .replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF\uDC00-\uDFFF]|[\u2600-\u26FF])/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(line => line.length > 0)
    .join('\n');
}

// ✅ Get current user's name from LinkedIn
function getMyName(): string {
  const profileBtn = document.querySelector('.global-nav__me-photo') as HTMLElement;
  const nameEl = document.querySelector('.global-nav__me-content span') as HTMLElement;
  return nameEl?.textContent?.trim() || "You";
}

async function runIteration(n: number) {
  const N = n - 1;
  logAction("started", { N });
  const { apiKey, chatMin, chatMax, loopMin, loopMax, prompt, leadPrompt, targetEmail } = await getSettings();
  const myName = getMyName();
  
  await scrollConversationList(5);
  let chats = Array.from(document.querySelectorAll("ul.msg-conversations-container__conversations-list li"))
    .slice(0, n)
    .sort(() => Math.random() - 0.2);
  
  await humanScroll();
  await scrollConversationList(11);
  
  for (let i = 0; i < chats.length && botRunning; i++) {
    await humanScroll();
    await scrollConversationList(11);
    await randomDelay(chatMin, chatMax);
    
    const clickable = chats[i].querySelector<HTMLElement>("a, .msg-conversation-listitem__link, [tabindex='0']");
    clickable?.click();
    await randomDelay(1500, 2500);

    const leadName = getLeadName();
    if (!leadName) {
      logAction("skipped", { reason: "No lead name found" });
      continue;
    }

    const lastMsg = getLastMessage(leadName);
    if (!lastMsg || !lastMsg.fromLead) {
      logAction("skipped", { lead: leadName, reason: "No new message from lead" });
      continue;
    }

    // ✅ Get structured conversation
    const structuredConvo = getStructuredConversation();
    if (structuredConvo.length === 0) {
      logAction("skipped", { lead: leadName, reason: "Empty conversation" });
      continue;
    }

    // ✅ NEW: AI decides if we should reply
    let decision: { shouldReply: boolean; reason: string };
    try {
      decision = await shouldReplyToConversation(apiKey, structuredConvo, leadName);
      logAction("ai_decision", { 
        lead: leadName, 
        decision: decision.shouldReply ? "REPLY" : "SKIP", 
        reason: decision.reason 
      });
    } catch (e) {
      logAction("error", { lead: leadName, error: "AI decision failed: " + getErrorMsg(e) });
      continue;
    }

    // ✅ If AI says SKIP, don't reply
    if (!decision.shouldReply) {
      logAction("skipped_by_ai", { lead: leadName, reason: decision.reason });
      continue;
    }

    // ✅ Lead check with recent messages (only if we're going to reply)
    const fullChat = getFullChat();
    const events = Array.from(document.querySelectorAll("li.msg-s-message-list__event"));
    const recentMsgs = events
      .reverse()
      .map((el) => el.textContent?.trim())
      .filter(Boolean)
      .slice(0, 2) as string[];

    if (recentMsgs.length === 2 && targetEmail) {
      try {
        const isPositive = await checkPositiveLead(apiKey, leadPrompt, recentMsgs);
        if (isPositive) {
          const cleanedChat = cleanChat(fullChat);
          await sendLeadAlertEmail(leadName, cleanedChat, targetEmail);
          logAction("positive_lead_email_sent", { lead: leadName });
        }
      } catch (e) {
        logAction("positive_lead_email_failed", { lead: leadName, error: getErrorMsg(e) });
      }
    }

    // ✅ Generate reply (only if AI approved)
    let reply: string;
    try {
      reply = await fetchReply(apiKey, prompt, structuredConvo, leadName, myName);
    } catch (e) {
      logAction("error", { lead: leadName, error: "Reply generation failed: " + getErrorMsg(e) });
      continue;
    }

    // ✅ Send the reply
    const input = document.querySelector<HTMLElement>("div.msg-form__contenteditable[role='textbox']");
    const sendBtn = document.querySelector<HTMLButtonElement>("button.msg-form__send-button");
    
    if (input && sendBtn) {
      await humanType(input, reply);
      await delay(500 + Math.random() * 1000);
      sendBtn.click();
      logAction("replied", { lead: leadName, reply, ai_reason: decision.reason });
    } else {
      logAction("error", { lead: leadName, error: "Send UI not found" });
    }

    await randomDelay(chatMin, chatMax);
    if (i > 0 && i % 5 === 0) await humanScroll();
  }

  logAction("finished iteration");
  if (botRunning) {
    botLoopTimeout = window.setTimeout(
      () => runIteration(n), 
      Math.floor(Math.random() * (loopMax - loopMin + 1)) + loopMin
    );
  }
}

chrome.runtime.onMessage.addListener((msg: ContentCommand, _sender, sendResponse) => {
  switch (msg.type) {
    case "PING_TEST":
      sendResponse("✅ Content script active!");
      return;
    case "START_BOT":
      if (!botRunning) {
        botRunning = true;
        runIteration(msg.n!);
        sendResponse({ status: "ok" });
      } else {
        sendResponse({ status: "error", error: "Bot already running" });
      }
      return;
    case "STOP_BOT":
      botRunning = false;
      if (botLoopTimeout !== null) clearTimeout(botLoopTimeout);
      logAction("stopped");
      sendResponse({ status: "stopped" });
      return;
    case "CHECK_UNREAD": {
      const leadName = getLeadName();
      const lastMsg = leadName ? getLastMessage(leadName) : null;
      if (leadName && lastMsg?.fromLead) {
        chrome.runtime.sendMessage({ 
          type: "NEW_MESSAGE", 
          payload: { chatId: leadName, messageText: lastMsg.content } 
        });
      }
      sendResponse({ status: "checked" });
      return;
    }
    default:
      sendResponse({ status: "error", error: "Unknown command" });
      return;
  }
});
