// linkedinresponder/src/background/background.ts

import { getBotSettings } from "../shared/settings";

let botEnabled = false;

async function initialize() {
  const result = await chrome.storage.local.get(["botEnabled"]);
  botEnabled = result.botEnabled ?? false;
  console.log(`[Background] Initialized. Bot enabled: ${botEnabled}`);
}
initialize();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.botEnabled !== undefined) {
    botEnabled = changes.botEnabled.newValue ?? false;
    console.log(`[Background] Bot enabled changed: ${botEnabled}`);
  }
});

const SCAN_ALARM_NAME = "linkedin-scan";
const SCAN_INTERVAL_MINUTES = 5;

// Guard against duplicate alarms on worker restarts
chrome.alarms.get(SCAN_ALARM_NAME, (existing) => {
  if (!existing) {
    chrome.alarms.create(SCAN_ALARM_NAME, { periodInMinutes: SCAN_INTERVAL_MINUTES });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SCAN_ALARM_NAME && botEnabled) {
    console.log("[Background] Alarm triggered, running scan...");
    triggerScanOnLinkedInTabs();
  }
});

async function triggerScanOnLinkedInTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: "https://www.linkedin.com/messaging/*" });

    if (tabs.length === 0) {
      console.log("[Background] No LinkedIn messaging tabs found");
      return;
    }

    for (const tab of tabs) {
      if (tab.id !== undefined) {
        chrome.tabs.sendMessage(tab.id, { type: "CHECK_UNREAD" }).catch((err) => {
          console.log(`[Background] Could not message tab ${tab.id}:`, err.message);
        });
      }
    }

    console.log(`[Background] Sent CHECK_UNREAD to ${tabs.length} tab(s)`);
  } catch (err) {
    console.error("[Background] Scan failed:", err);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true;
});

async function handleMessage(
  message: { type: string; [key: string]: any },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
) {
  const { type } = message;

  switch (type) {
    case "PING_BOT":
      sendResponse({ status: botEnabled ? "running" : "stopped" });
      break;

    case "START_BOT":
      botEnabled = true;
      await chrome.storage.local.set({ botEnabled: true });
      console.log("[Background] Bot started via message");
      sendResponse({ status: "running" });
      break;

    case "STOP_BOT":
      botEnabled = false;
      await chrome.storage.local.set({ botEnabled: false });
      console.log("[Background] Bot stopped via message");
      sendResponse({ status: "stopped" });
      break;

    case "RUN_SCAN_NOW":
      if (botEnabled) {
        triggerScanOnLinkedInTabs();
        sendResponse({ status: "running" });
      } else {
        sendResponse({ status: "stopped" });
      }
      break;

    case "GET_SETTINGS":
      try {
        const settings = await getBotSettings();
        sendResponse({ status: "ok", settings });
      } catch (err) {
        sendResponse({ status: "error", error: String(err) });
      }
      break;

    case "TEST_API_KEY":
      await handleTestApiKey(
        { provider: message.provider, key: message.key },
        sendResponse
      );
      break;

    default:
      console.log(`[Background] Unknown message type: ${type}`);
      sendResponse({ status: "unknown" });
  }
}

// API key testing (bypasses CORS for options page)
async function handleTestApiKey(
  message: { provider: string; key: string },
  sendResponse: (response: any) => void
) {
  const { provider, key } = message;

  if (!key?.trim()) {
    sendResponse({ success: false, message: "Key is empty" });
    return;
  }

  const endpoints: Record<string, string> = {
    openai: "https://api.openai.com/v1/models",
    groq: "https://api.groq.com/openai/v1/models",
    groq2: "https://api.groq.com/openai/v1/models", // NEW: Second Groq key uses same endpoint
    routeway: "https://api.routeway.ai/v1/models", // NEW: Routeway endpoint
  };

  const url = endpoints[provider];
  if (!url) {
    sendResponse({ success: false, message: "Unknown provider" });
    return;
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });

    const msg = `${response.status} ${response.statusText}${response.status === 429 ? " (rate limited)" : ""}`;
    sendResponse({ success: response.ok, message: msg });
  } catch (err: any) {
    sendResponse({ success: false, message: err?.message || "Request failed" });
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[Background] Extension installed/updated: ${details.reason}`);
  chrome.alarms.get(SCAN_ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(SCAN_ALARM_NAME, { periodInMinutes: SCAN_INTERVAL_MINUTES });
      console.log("[Background] Scan alarm created");
    }
  });
});
