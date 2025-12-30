import { BotCommand, BotLogEntry, BotStats, BotStatus } from "../shared/types";
import { checkPositiveLead, sendLeadAlertEmail, shouldReplyToConversation } from "../shared/sendEmail";

// Extend BotCommand to include ping and unread check
type ContentCommand =
  | BotCommand
  | { type: "PING_TEST" }
  | { type: "CHECK_UNREAD" };

// --- STATE VARIABLES ---
let botRunning = false;
let botLoopTimeout: number | null = null;
let stats: BotStats = { chatsProcessed: 0, repliesSent: 0, leadsFound: 0, startTime: null, tokensUsed: 0, currentModel: "" };
let logs: BotLogEntry[] = [];
let useStrictHours = true;
let useGroq = false;
let groqModel = "llama-3.3-70b-versatile";

// --- LOGGING & STATS HELPERS ---
function addLog(type: "INFO" | "ACTION" | "ERROR" | "SUCCESS" | "WARNING", message: string, actor: "User" | "Bot" | "System") {
  const entry: BotLogEntry = { time: Date.now(), type, message, actor };
  logs.unshift(entry);
  if (logs.length > 100) logs.pop();
  chrome.storage.local.set({ botLog: logs.slice(0, 50) });
}

function updateStats(key: keyof BotStats, value: number | string) {
  if (key === 'startTime') {
      stats.startTime = value as number;
  } else if (key === 'tokensUsed') {
      stats.tokensUsed = value as number;
  } else if (key === 'currentModel') {
      stats.currentModel = value as string;
  } else {
      (stats[key] as number) += value as number;
  }
}

// --- UTILS ---
function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

function calculateTypingDelay(text: string): number {
  const words = text.split(" ").length;
  const baseDelay = 2000; 
  const msPerWord = 300;  
  return baseDelay + (words * msPerWord) + (Math.random() * 2000);
}

function isWithinWorkingHours(startHour: number = 9, endHour: number = 18): boolean {
  const currentHour = new Date().getHours();
  return currentHour >= startHour && currentHour < endHour;
}

async function humanType(input: HTMLElement, text: string) {
  input.focus();
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
  const container = document.querySelector<HTMLElement>('.msg-conversations-container--inbox-shortcuts');
  if (!container) return;

  for (let i = 0; i < times; i++) {
    container.scrollBy({ top: Math.random() * 200 + 100, behavior: 'smooth' });
    await delay(500 + Math.random() * 800);
    container.scrollBy({ top: -(Math.random() * 50), behavior: 'smooth' });
    await delay(400 + Math.random() * 500);
  }
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
  targetEmail: string;
  startHour: number;
  endHour: number;
}> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        "openaiApiKey",
        "groqApiKey",
        "chatMinDelay",
        "chatMaxDelay",
        "loopMinDelay",
        "loopMaxDelay",
        "replyPrompt",
        "leadPrompt",
        "targetEmail",
        "startHour",
        "endHour"
      ],
      (res) =>
        resolve({
          apiKey: res.openaiApiKey,
          groqApiKey: res.groqApiKey || "",
          chatMin: res.chatMinDelay || 1000,
          chatMax: res.chatMaxDelay || 2500,
          loopMin: res.loopMinDelay || 3000,
          loopMax: res.loopMaxDelay || 6000,
          prompt: res.replyPrompt || "Reply briefly:",
          leadPrompt: res.leadPrompt || "Interested lead",
          targetEmail: res.targetEmail || "",
          startHour: res.startHour || 9,
          endHour: res.endHour || 18,
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

function getStructuredConversation(): Array<{ speaker: string; message: string }> {
  const events = Array.from(document.querySelectorAll("li.msg-s-message-list__event"));
  const conversation: Array<{ speaker: string; message: string }> = [];

  for (const msgEl of events) {
    const senderEl = msgEl.querySelector("span.msg-s-message-group__name");
    const contentEl = msgEl.querySelector("p.msg-s-event-listitem__body");
    if (senderEl && contentEl) {
      conversation.push({ 
          speaker: senderEl.textContent?.trim() || "Unknown", 
          message: contentEl.textContent?.trim() || "" 
      });
    }
  }
  return conversation;
}

// ✅ UPDATED: Track tokens and add model name
async function fetchReply(apiKey: string, prompt: string, conversation: any[], leadName: string, myName: string, useGroqAPI: boolean = false, groqModelName: string = "llama-3.3-70b-versatile"): Promise<{ reply: string; tokensUsed: number }> {
  const conversationText = conversation.map(msg => `${msg.speaker}: ${msg.message}`).join("\n");
  const systemPrompt = `You are a professional LinkedIn user. Write like a human (brief, casual).
Context:
${conversationText}
${prompt.replace("{extracted_text}", conversationText).replace("{user_name}", leadName)}
Respond as ${myName}.`;

  // ✅ Choose API endpoint based on provider
  const apiUrl = useGroqAPI 
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";

  const model = useGroqAPI ? groqModelName : "gpt-4o-mini";

  // ✅ FIXED: Dynamic max_tokens based on model
  let maxTokens = 150;
  if (useGroqAPI) {
    if (groqModelName === "openai/gpt-oss-120b") {
      maxTokens = 500;  // More tokens for verbose GPT-OSS
    } else if (groqModelName === "moonshotai/kimi-k2-instruct-0905") {
      maxTokens = 250;  // Medium for Kimi K2
    } else {
      maxTokens = 250;  // Default for Llama 3.3 and others
    }
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model,
      messages: [
          { role: "system", content: systemPrompt },
          ...conversation.slice(-20).map(msg => ({
              role: msg.speaker === leadName ? "user" : "assistant",
              content: msg.message
          }))
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!response.ok) throw new Error(`${useGroqAPI ? "Groq" : "OpenAI"} API Error`);
  const data = await response.json();
  
  // ✅ NEW: Calculate total tokens used
  const tokensUsed = (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0);
  
  return { 
    reply: data.choices[0].message.content.trim(),
    tokensUsed 
  };
}

function getMyName(): string {
  const nameEl = document.querySelector('.global-nav__me-content span') as HTMLElement;
  return nameEl?.textContent?.trim() || "You";
}

// ✅ UPDATED: Get model display name
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

// --- MAIN LOOP ---
async function runIteration(n: number) {
  addLog("INFO", `Starting batch of ${n} chats...`, "System");
  
  const { apiKey, groqApiKey, chatMin, chatMax, loopMin, loopMax, prompt, leadPrompt, targetEmail, startHour, endHour } = await getSettings();
  
  // ✅ Determine which API key to use
  const activeApiKey = useGroq ? groqApiKey : apiKey;
  
  // ✅ Update current model in stats
  const currentModelName = useGroq ? groqModel : "gpt-4o-mini";
  updateStats("currentModel", getModelDisplayName(currentModelName));
  
  // ✅ CHECK: Strict Mode Working Hours
  if (useStrictHours && !isWithinWorkingHours(startHour, endHour)) {
    addLog("WARNING", `Outside working hours (${startHour}-${endHour}). Pausing.`, "System");
    if (botRunning) {
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
    // Scroll & Click
    await humanScroll();
    await randomDelay(chatMin, chatMax);
    const clickable = chats[i].querySelector<HTMLElement>("a, .msg-conversation-listitem__link, [tabindex='0']");
    clickable?.click();
    
    // Wait for load
    await delay(2000); 

    const leadName = getLeadName();
    if (!leadName) continue;

    addLog("INFO", `Checking chat with ${leadName}...`, "Bot");
    updateStats("chatsProcessed", 1);

    const lastMsg = getLastMessage(leadName);
    if (!lastMsg || !lastMsg.fromLead) {
        addLog("INFO", `Skipping ${leadName}: Last message was from me.`, "Bot");
        continue;
    }

    const structuredConvo = getStructuredConversation();
    if (structuredConvo.length === 0) continue;

    // AI Decision
    let decision;
    try {
      decision = await shouldReplyToConversation(activeApiKey, structuredConvo, leadName);
      addLog("ACTION", `AI Decision for ${leadName}: ${decision.shouldReply ? "REPLY" : "SKIP"} (${decision.reason})`, "Bot");
    } catch (e) {
      addLog("ERROR", `AI Decision Failed: ${getErrorMsg(e)}`, "System");
      continue;
    }

    if (!decision.shouldReply) continue;

    // Lead Alert Logic
    if (targetEmail) {
        try {
            const recentMsgs = structuredConvo.slice(-2).map(m => m.message);
            const isPositive = await checkPositiveLead(activeApiKey, leadPrompt, recentMsgs);
            if (isPositive) {
                const fullChat = structuredConvo.map(m => `${m.speaker}: ${m.message}`).join("\n");
                await sendLeadAlertEmail(leadName, fullChat, targetEmail);
                updateStats("leadsFound", 1);
                addLog("SUCCESS", `HOT LEAD FOUND: ${leadName}. Email sent!`, "Bot");
            }
        } catch (e) {
            addLog("ERROR", `Lead check failed: ${getErrorMsg(e)}`, "System");
        }
    }

    // Generate Reply
    let replyData: { reply: string; tokensUsed: number };
    try {
      replyData = await fetchReply(activeApiKey, prompt, structuredConvo, leadName, myName, useGroq, groqModel);
      
      // ✅ NEW: Update token counter
      updateStats("tokensUsed", stats.tokensUsed + replyData.tokensUsed);
      
    } catch (e) {
      addLog("ERROR", `Reply Generation Failed: ${getErrorMsg(e)}`, "System");
      continue;
    }

    // Send Reply
    const input = document.querySelector<HTMLElement>("div.msg-form__contenteditable[role='textbox']");
    const sendBtn = document.querySelector<HTMLButtonElement>("button.msg-form__send-button");
    
    if (input && sendBtn) {
      const typingDelay = calculateTypingDelay(replyData.reply);
      addLog("ACTION", `Typing reply to ${leadName} (waiting ${Math.round(typingDelay/1000)}s)...`, "Bot");
      await delay(typingDelay);

      await humanType(input, replyData.reply);
      await delay(800);
      
      // ✅ FIXED: Check if send button is enabled before clicking
      const isDisabled = sendBtn.hasAttribute("disabled") || sendBtn.classList.contains("disabled");
      if (isDisabled) {
        addLog("ERROR", `Send button disabled for ${leadName} - message might be empty or invalid`, "System");
      } else {
        sendBtn.click();
        await delay(500);  // Wait for UI to update
        
        // ✅ FIXED: Verify message was sent (input should be cleared)
        const inputText = input.textContent?.trim() || "";
        if (inputText.length > 0) {
          addLog("WARNING", `Message may not have sent to ${leadName} - input not cleared`, "System");
        } else {
          updateStats("repliesSent", 1);
          // ✅ NEW: Show model name in success log
          addLog("SUCCESS", `Sent reply to ${leadName} (${getModelDisplayName(currentModelName)})`, "Bot");
        }
      }
    } else {
        addLog("ERROR", "Could not find chat input box", "System");
    }

    await randomDelay(chatMin, chatMax);
  }

  addLog("INFO", "Batch finished. Sleeping...", "System");
  
  if (botRunning) {
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
      const status: BotStatus = { running: botRunning, stats, logs };
      sendResponse(status);
      return;
  }

  if (msg.type === "START_BOT") {
    if (!botRunning) {
        botRunning = true;
        stats.startTime = Date.now();
        stats.tokensUsed = 0;  // ✅ Reset token counter on start
        useStrictHours = msg.config?.strictHours ?? true;
        useGroq = msg.config?.useGroq ?? false;
        groqModel = msg.config?.groqModel ?? "llama-3.3-70b-versatile";
        
        addLog("INFO", `Bot started (Provider: ${useGroq ? 'Groq' : 'OpenAI'}, Strict Hours: ${useStrictHours ? 'ON' : 'OFF'})`, "User");
        runIteration(msg.config?.nChats ?? 10);
        sendResponse({ status: "ok" });
    } else {
        sendResponse({ status: "error", error: "Already running" });
    }
    return;
  }

  if (msg.type === "STOP_BOT") {
    botRunning = false;
    if (botLoopTimeout !== null) clearTimeout(botLoopTimeout);
    addLog("INFO", "Bot stopped by user", "User");
    sendResponse({ status: "stopped" });
    return;
  }
});
