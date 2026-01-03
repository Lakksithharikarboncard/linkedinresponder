// linkedinresponder/src/background/background.ts
//
// Purpose: Service worker for the Chrome extension
// Responsibilities:
//   - Periodic scan alarms
//   - Bot state persistence
//   - Message routing between popup and content scripts
//
// Note: All reply generation logic lives in content.ts
//       This file is intentionally minimal.

import { getBotSettings } from "../shared/settings";

// --- STATE ---
let botEnabled = false;

// --- INITIALIZATION ---
async function initialize() {
  // Load persisted bot state
  const result = await chrome.storage.local.get(["botEnabled"]);
  botEnabled = result.botEnabled ?? false;

  console.log(`[Background] Initialized. Bot enabled: ${botEnabled}`);
}

initialize();

// --- STORAGE LISTENER ---
// Keep local state in sync if changed elsewhere (e.g., from content script)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.botEnabled !== undefined) {
    botEnabled = changes.botEnabled.newValue ?? false;
    console.log(`[Background] Bot enabled changed: ${botEnabled}`);
  }
});

// --- ALARM SETUP ---
// Periodic scan every 5 minutes when bot is enabled
const SCAN_ALARM_NAME = "linkedin-scan";
const SCAN_INTERVAL_MINUTES = 5;

chrome.alarms.create(SCAN_ALARM_NAME, { periodInMinutes: SCAN_INTERVAL_MINUTES });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SCAN_ALARM_NAME && botEnabled) {
    console.log("[Background] Alarm triggered, running scan...");
    triggerScanOnLinkedInTabs();
  }
});

// --- SCAN LOGIC ---
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
          // Tab might not have content script loaded
          console.log(`[Background] Could not message tab ${tab.id}:`, err.message);
        });
      }
    }

    console.log(`[Background] Sent CHECK_UNREAD to ${tabs.length} tab(s)`);
  } catch (err) {
    console.error("[Background] Scan failed:", err);
  }
}

// --- MESSAGE HANDLING ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Keep channel open for async response
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
      // Provide settings to any requester (useful for debugging)
      try {
        const settings = await getBotSettings();
        sendResponse({ status: "ok", settings });
      } catch (err) {
        sendResponse({ status: "error", error: String(err) });
      }
      break;

    default:
      console.log(`[Background] Unknown message type: ${type}`);
      sendResponse({ status: "unknown" });
  }
}

// --- EXTENSION LIFECYCLE ---
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[Background] Extension installed/updated: ${details.reason}`);

  // Ensure alarm exists after install/update
  chrome.alarms.get(SCAN_ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(SCAN_ALARM_NAME, { periodInMinutes: SCAN_INTERVAL_MINUTES });
      console.log("[Background] Scan alarm created");
    }
  });
});

// Optional: Handle extension icon click (if not using popup)
// chrome.action.onClicked.addListener((tab) => {
//   chrome.tabs.create({ url: "popup.html" });
// });