// import { BotCommand, BotLogEntry } from "../shared/types";



// // Extend BotCommand to include ping and unread check
// type ContentCommand =
//   | BotCommand
//   | { type: "PING_TEST" }
//   | { type: "CHECK_UNREAD" };

// let botRunning = false;
// let botLoopTimeout: number | null = null;

// function getErrorMsg(err: unknown): string {
//   if (typeof err === "string") return err;
//   if (err && typeof err === "object" && "message" in err) return (err as any).message;
//   return "Unknown error";
// }

// function logAction(type: string, detail?: any) {
//   chrome.storage.local.get(["botLog"], (res) => {
//     const log: BotLogEntry[] = res.botLog || [];
//     log.unshift({ time: Date.now(), type, detail });
//     chrome.storage.local.set({ botLog: log.slice(0, 50) });
//   });
// }

// function delay(ms: number) {
//   return new Promise<void>((res) => setTimeout(res, ms));
// }

// function randomDelay(min: number, max: number) {
//   const ms = Math.floor(Math.random() * (max - min + 1)) + min;
//   return delay(ms);
// }

// async function humanType(input: HTMLElement, text: string) {
//   input.focus();
//   document.execCommand("selectAll", false, "");
//   document.execCommand("delete", false, "");
//   for (const char of text) {
//     document.execCommand("insertText", false, char);
//     await delay(50 + Math.random() * 150);
//   }
// }

// async function humanScroll() {
//   const pane = document.querySelector<HTMLElement>(
//     ".msg-s-message-list-content"
//   );
//   if (!pane) return;
//   const down = Math.random() * 80 + 20;
//   pane.scrollBy(0, down);
//   await delay(300 + Math.random() * 500);
//   pane.scrollBy(0, -(Math.random() * 50 + 10));
//   await delay(300 + Math.random() * 500);
// }

// async function getSettings(): Promise<{ apiKey: string; chatMin: number; chatMax: number; loopMin: number; loopMax: number; prompt: string }> {
//   return new Promise((resolve) => {
//     chrome.storage.local.get(
//       [
//         "openaiApiKey",
//         "chatMinDelay",
//         "chatMaxDelay",
//         "loopMinDelay",
//         "loopMaxDelay",
//         "replyPrompt",
//       ],
//       (res) =>
//         resolve({
//           apiKey: res.openaiApiKey,
//           chatMin: res.chatMinDelay || 1000,
//           chatMax: res.chatMaxDelay || 2500,
//           loopMin: res.loopMinDelay || 3000,
//           loopMax: res.loopMaxDelay || 6000,
//           prompt: res.replyPrompt || "Reply briefly and professionally to this LinkedIn message:",
//         })
//     );
//   });
// }

// function getLeadName(): string | null {
//   const el = document.evaluate(
//     '//*[@id="thread-detail-jump-target"]/div/a/div/dl/dt/h2',
//     document,
//     null,
//     XPathResult.FIRST_ORDERED_NODE_TYPE,
//     null
//   ).singleNodeValue as HTMLElement | null;
//   return el?.textContent?.trim() || null;
// }

// function getLastMessage(leadName: string): { fromLead: boolean; content: string } | null {
//   const events = Array.from(document.querySelectorAll("li.msg-s-message-list__event"));
//   for (let i = events.length - 1; i >= 0; i--) {
//     const msgEl = events[i];
//     const senderEl = msgEl.querySelector("span.msg-s-message-group__name");
//     const contentEl = msgEl.querySelector("p.msg-s-event-listitem__body");
//     if (senderEl && contentEl) {
//       const sender = senderEl.textContent?.trim() || "";
//       const content = contentEl.textContent?.trim() || "";
//       if (!content) continue;
//       return { fromLead: sender.includes(leadName), content };
//     }
//   }
//   return null;
// }

// function getFullChat(): string {
//   const ul = document.querySelector("ul.msg-s-message-list-content");
//   if (!ul) return "";
//   return Array.from(ul.children)
//     .map((li) => li.textContent?.replace(/\s+/g, " ").trim() || "")
//     .filter(Boolean)
//     .join("\n");
// }

// async function fetchReply(apiKey: string, prompt: string, messages: string, leadName: string): Promise<string> {
//   const body = {
//     model: "gpt-4",
//     messages: [
//       { role: "system", content: prompt.replace("{extracted_text}", messages).replace("{user_name}", leadName) },
//       { role: "user", content: messages }
//     ],
//     max_tokens: 1000,
//     temperature: 0.4
//   };
//   const response = await fetch("https://api.openai.com/v1/chat/completions", {
//     method: "POST",
//     headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
//     body: JSON.stringify(body)
//   });
//   if (!response.ok) throw new Error("OpenAI API error");
//   const data = await response.json();
//   return data.choices[0].message.content.trim();
// }

// // async function runIteration(n: number) {

// //   logAction("started", { n });
// //   const { apiKey, chatMin, chatMax, loopMin, loopMax, prompt } = await getSettings();
// //   let chats = Array.from(document.querySelectorAll('ul.msg-conversations-container__conversations-list li')).slice(0, n).sort(() => Math.random() - 0.5);

// //   for (let i = 0; i < chats.length && botRunning; i++) {
// //     await humanScroll();
// //     await randomDelay(chatMin, chatMax);
// //     const clickable = chats[i].querySelector<HTMLElement>('a, .msg-conversation-listitem__link, [tabindex="0"]');
// //     clickable?.click();
// //     await randomDelay(1500, 2500);

// //     const leadName = getLeadName();
// //     if (!leadName) { logAction("error", { chat: i+1, error: "Lead name not found" }); continue; }

// //     const lastMsg = getLastMessage(leadName);
// //     if (!lastMsg || !lastMsg.fromLead) { logAction("skipped", { chat: i+1, reason: "No new message" }); continue; }

// //     const fullChat = getFullChat();
// //     if (!fullChat) { logAction("skipped", { chat: i+1, reason: "Chat empty" }); continue; }

// //     let reply: string;
// //     try { reply = await fetchReply(apiKey, prompt, fullChat, leadName); } catch (e) { logAction("error", { chat: i+1, error: getErrorMsg(e) }); continue; }

// //     const input = document.querySelector<HTMLElement>("div.msg-form__contenteditable[role='textbox']");
// //     const sendBtn = document.querySelector<HTMLButtonElement>("button.msg-form__send-button");
// //     if (input && sendBtn) { await humanType(input, reply); await delay(500 + Math.random()*1000); sendBtn.click(); logAction("replied", { chat: i+1, reply }); }
// //     else { logAction("error", { chat: i+1, error: "Send UI not found" }); }

// //     await randomDelay(chatMin, chatMax);
// //     if (i>0 && i%5===0) await humanScroll();
// //   }

// //   logAction("finished iteration");
// //   if (botRunning) { botLoopTimeout = window.setTimeout(() => runIteration(n), Math.floor(Math.random()*(loopMax-loopMin+1))+loopMin); }
// // }


// async function runIteration(n: number) {
//   const N = n-1;
//   logAction("started", { N });
//   const { apiKey, chatMin, chatMax, loopMin, loopMax, prompt } = await getSettings();
//   let chats = Array.from(document.querySelectorAll('ul.msg-conversations-container__conversations-list li')).slice(0, n).sort(() => Math.random() - 0.2);

//   for (let i = 0; i < chats.length && botRunning; i++) {
//     await humanScroll();
//     await randomDelay(chatMin, chatMax);
//     const clickable = chats[i].querySelector<HTMLElement>('a, .msg-conversation-listitem__link, [tabindex="0"]');
//     clickable?.click();
//     await randomDelay(1500, 2500);

//     const leadName = getLeadName();
//     if (!leadName) { continue; }

//     const lastMsg = getLastMessage(leadName);
//     if (!lastMsg || !lastMsg.fromLead) { continue; }

//     const fullChat = getFullChat();
//     if (!fullChat) { continue; }

//     let reply: string;
//     try { reply = await fetchReply(apiKey, prompt, fullChat, leadName); } catch (e) { logAction("error", {  error: getErrorMsg(e) }); continue; }

//     const input = document.querySelector<HTMLElement>("div.msg-form__contenteditable[role='textbox']");
//     const sendBtn = document.querySelector<HTMLButtonElement>("button.msg-form__send-button");
//     if (input && sendBtn) { await humanType(input, reply); await delay(500 + Math.random()*1000); sendBtn.click(); logAction("replied", { reply }); }
//     else { logAction("error", {  error: "Send UI not found" }); }

//     await randomDelay(chatMin, chatMax);
//     if (i>0 && i%5===0) await humanScroll();
//   }

//   logAction("finished iteration");
//   if (botRunning) { botLoopTimeout = window.setTimeout(() => runIteration(n), Math.floor(Math.random()*(loopMax-loopMin+1))+loopMin); }
// }

// chrome.runtime.onMessage.addListener((msg: ContentCommand, _sender, sendResponse) => {
//   switch (msg.type) {
//     case "PING_TEST":
//       sendResponse("✅ Content script active!");
//       return;
//     case "START_BOT":
//       if (!botRunning) { botRunning = true; runIteration(msg.n!); sendResponse({ status: "ok" }); }
//       else { sendResponse({ status: "error", error: "Bot already running" }); }
//       return;
//     case "STOP_BOT":
//       botRunning = false; if (botLoopTimeout!==null) clearTimeout(botLoopTimeout); logAction("stopped"); sendResponse({ status: "stopped" });
//       return;
//     case "CHECK_UNREAD": {
//       const leadName = getLeadName(); const lastMsg = leadName? getLastMessage(leadName): null;
//       if (leadName && lastMsg?.fromLead) { chrome.runtime.sendMessage({ type: "NEW_MESSAGE", payload: { chatId: leadName, messageText: lastMsg.content } }); }
//       sendResponse({ status: "checked" });
//       return;
//     }
//     default:
//       sendResponse({ status: "error", error: "Unknown command" });
//       return;
//   }
// });


import { BotCommand, BotLogEntry } from "../shared/types";
import { checkPositiveLead, sendLeadAlertEmail } from "../shared/sendEmail";

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
    const scrollDown = Math.random() * 200 + 100; // Scroll 100–300px
    container.scrollBy({ top: scrollDown, behavior: 'smooth' });

    await delay(500 + Math.random() * 800);

    const scrollUp = Math.random() * 50; // Small reverse adjustment
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

function getFullChat(): string {
  const ul = document.querySelector("ul.msg-s-message-list-content");
  if (!ul) return "";
  return Array.from(ul.children)
    .map((li) => li.textContent?.replace(/\s+/g, " ").trim() || "")
    .filter(Boolean)
    .join("\n");
}

async function fetchReply(apiKey: string, prompt: string, messages: string, leadName: string): Promise<string> {
  const body = {
    model: "gpt-4",
    messages: [
      { role: "system", content: prompt.replace("{extracted_text}", messages).replace("{user_name}", leadName) },
      { role: "user", content: messages },
    ],
    max_tokens: 1000,
  };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("OpenAI API error");
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

function cleanChat(chat: string): string {
  return chat
    .split('\n')
    .map(line =>
      line
        .replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF\uDC00-\uDFFF]|[\u2600-\u26FF])/g, '') // remove emojis
        .replace(/\s+/g, ' ') // normalize spaces
        .trim()
    )
    .filter(line => line.length > 0) // remove empty lines
    .join('\n');
}

async function runIteration(n: number) {
  const N = n - 1;
  logAction("started", { N });
  const { apiKey, chatMin, chatMax, loopMin, loopMax, prompt, leadPrompt, targetEmail } = await getSettings();
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
    if (!leadName) continue;

    const lastMsg = getLastMessage(leadName);
    if (!lastMsg || !lastMsg.fromLead) continue;

    const fullChat = getFullChat();
    if (!fullChat) continue;

    // ✅ GPT-4 Lead Check & Email
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
        logAction("positive_lead_email_failed", { error: getErrorMsg(e) });
      }
    }

    let reply: string;
    try {
      reply = await fetchReply(apiKey, prompt, fullChat, leadName);
    } catch (e) {
      logAction("error", { error: getErrorMsg(e) });
      continue;
    }

    const input = document.querySelector<HTMLElement>("div.msg-form__contenteditable[role='textbox']");
    const sendBtn = document.querySelector<HTMLButtonElement>("button.msg-form__send-button");
    if (input && sendBtn) {
      await humanType(input, reply);
      await delay(500 + Math.random() * 1000);
      sendBtn.click();
      logAction("replied", { reply });
    } else {
      logAction("error", { error: "Send UI not found" });
    }

    await randomDelay(chatMin, chatMax);
    if (i > 0 && i % 5 === 0) await humanScroll();
  }

  logAction("finished iteration");
  if (botRunning) {
    botLoopTimeout = window.setTimeout(() => runIteration(n), Math.floor(Math.random() * (loopMax - loopMin + 1)) + loopMin);
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
        chrome.runtime.sendMessage({ type: "NEW_MESSAGE", payload: { chatId: leadName, messageText: lastMsg.content } });
      }
      sendResponse({ status: "checked" });
      return;
    }
    default:
      sendResponse({ status: "error", error: "Unknown command" });
      return;
  }
});
