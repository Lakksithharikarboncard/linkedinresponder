

import { randomBetween, sleep } from "../shared/utils";

let openaiKey = "";
let minDelay = 300;
let maxDelay = 900;
let autoEnabled = false;
let replyPrompt = "Reply briefly and professionally to this LinkedIn message:";

chrome.storage.local.get(
  ["openaiApiKey", "minDelay", "maxDelay", "autoReplyEnabled", "replyPrompt"],
  res => {
    openaiKey = res.openaiApiKey || "";
    minDelay = res.minDelay || minDelay;
    maxDelay = res.maxDelay || maxDelay;
    autoEnabled = res.autoReplyEnabled || false;
    replyPrompt = res.replyPrompt || replyPrompt;
  }
);

chrome.storage.onChanged.addListener((changes) => {
  if (changes.openaiApiKey) openaiKey = changes.openaiApiKey.newValue;
  if (changes.minDelay) minDelay = changes.minDelay.newValue;
  if (changes.maxDelay) maxDelay = changes.maxDelay.newValue;
  if (changes.autoReplyEnabled) autoEnabled = changes.autoReplyEnabled.newValue;
  if (changes.replyPrompt) replyPrompt = changes.replyPrompt.newValue;
});

// Periodic scan
chrome.alarms.create("scan", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "scan" && autoEnabled) {
    runScan();
  }
});

function runScan() {
  chrome.tabs.query(
    { url: "https://www.linkedin.com/messaging/*" },
    tabs => {
      tabs.forEach(tab => {
        if (tab.id !== undefined) {
          chrome.tabs.sendMessage(tab.id, { type: "CHECK_UNREAD" });
        }
      });
    }
  );
}

chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: chrome.runtime.getURL("window.html"),
    type: "popup",
    width: 600,
    height: 400
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "RUN_SCAN_NOW":
      if (autoEnabled) runScan();
      sendResponse({ status: autoEnabled ? "running" : "stopped" });
      break;
    case "START_BOT":
      autoEnabled = true;
      chrome.storage.local.set({ autoReplyEnabled: true });
      sendResponse({ status: "running" });
      break;
    case "STOP_BOT":
      autoEnabled = false;
      chrome.storage.local.set({ autoReplyEnabled: false });
      sendResponse({ status: "stopped" });
      break;
    case "PING_BOT":
      sendResponse({ status: autoEnabled ? "running" : "stopped" });
      break;
    case "NEW_MESSAGE":
      handleNewMessage(msg.payload, sender);
      break;
    case "GENERATE_AND_SEND":
      handleGenerateAndSend(msg, sender);
      break;
  }
  return true;
});

function handleNewMessage(payload: any, sender: chrome.runtime.MessageSender) {
  const tab = sender.tab;
  if (!tab || tab.id === undefined) return;

  const { chatId, messageText } = payload;
  const tabId = tab.id;
  const today = new Date().toISOString().slice(0, 10);

  chrome.storage.local.get(["repliedChats"], async (res) => {
    const repliedChats = res.repliedChats || {};
    const todaysList: string[] = repliedChats[today] || [];
    if (todaysList.includes(chatId)) return;

    try {
      const replyText = await generateReply(messageText);
      chrome.tabs.sendMessage(tabId, { type: "SEND_REPLY", payload: { chatId, replyText } });
      repliedChats[today] = [...todaysList, chatId];
      chrome.storage.local.set({ repliedChats });
      await sleep(randomBetween(minDelay, maxDelay));
    } catch (err) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "i.png",
        title: "Auto-Reply Error",
        message: (err as Error).message || "Error calling OpenAI"
      });
    }
  });
}

function handleGenerateAndSend(
  msg: any,
  sender: chrome.runtime.MessageSender
) {
  const tab = sender.tab;
  if (!tab || tab.id === undefined) return;

  const { chatId, chatHistory } = msg;
  chrome.storage.local.get(["openaiApiKey", "replyPrompt"], async (res) => {
    const key = res.openaiApiKey;
    const prompt = res.replyPrompt || replyPrompt;
    if (!key) {
      console.warn("OpenAI API key not set.");
      return;
    }

    try {
      const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: chatHistory }
          ]
        })
      });

      if (!apiResponse.ok) {
        console.error("OpenAI API error:", apiResponse.statusText);
        return;
      }

      const data = await apiResponse.json();
      const reply: string = data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a reply.";

      if (typeof tab.id === "number") {
        chrome.tabs.sendMessage(tab.id, {
          type: "SEND_REPLY",
          chatId,
          replyText: reply
        });
      }

    } catch (err) {
      console.error("OpenAI fetch failed:", err);
    }
  });
}

async function generateReply(messageText: string): Promise<string> {
  if (!openaiKey) throw new Error("Missing OpenAI API key in Settings.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages: [
        { role: "system", content: replyPrompt },
        { role: "user", content: messageText }
      ]
    })
  });

  if (!response.ok) {
    throw new Error("OpenAI error: " + response.statusText);
  }

  const { choices } = await response.json();
  return choices[0].message.content;
}
