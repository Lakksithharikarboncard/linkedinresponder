import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BotCommand, BotResponse, BotLogEntry } from "../shared/types";
import "./popup.css";

type TabCommand = BotCommand | { type: "PING_TEST" };

function openOptionsPage() {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  else window.open(chrome.runtime.getURL("options.html"));
}

const Popup: React.FC = () => {
  const [nChats, setNChats] = useState<number>(5);
  const [botRunning, setBotRunning] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [botLog, setBotLog] = useState<BotLogEntry[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [selectedModel, setSelectedModel] = useState<string>("gpt-4o-mini");

  useEffect(() => {
    chrome.storage.local.get(["botLog", "openaiApiKey", "selectedModel"], (res) => {
      setBotLog(res.botLog || []);
      setHasApiKey(!!res.openaiApiKey);
      setSelectedModel(res.selectedModel || "gpt-4o-mini");
    });

    const onChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local') {
        if (changes.botLog) setBotLog(changes.botLog.newValue || []);
        if (changes.openaiApiKey) setHasApiKey(!!changes.openaiApiKey.newValue);
        if (changes.selectedModel) setSelectedModel(changes.selectedModel.newValue || "gpt-4o-mini");
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    chrome.storage.local.set({ selectedModel: model });
  };

  const sendMessageToTab = <T,>(tabId: number, msg: TabCommand): Promise<T> =>
    new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, msg, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res as T);
      });
    });

  const getActiveUserTab = async (): Promise<{ id: number; url: string }> => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) throw new Error("No active tab");
    return { id: tab.id, url: tab.url || "unknown" };
  };

  async function runBot() {
    setFeedback(null);
    setBotRunning(true);
    try {
      const { id: tabId, url: currentUrl } = await getActiveUserTab();
      
      if (!currentUrl.includes("linkedin.com/messaging")) {
        setFeedback("Please navigate to LinkedIn Messaging page first");
        setBotRunning(false);
        return;
      }

      const ping = await sendMessageToTab<string>(tabId, { type: "PING_TEST" });
      if (ping !== "✅ Content script active!") {
        setFeedback("Content script not ready. Please refresh the page.");
        setBotRunning(false);
        return;
      }

      const resp = await sendMessageToTab<BotResponse>(tabId, { type: "START_BOT", n: nChats + 1 });
      if (resp.status === "ok") {
        setFeedback("Bot started successfully! 🚀");
      } else {
        setFeedback("Failed to start bot");
        setBotRunning(false);
      }
    } catch (err: any) {
      setFeedback(err.message || "Error starting bot");
      setBotRunning(false);
    }
  }

  async function stopBot() {
    setFeedback(null);
    try {
      const { id: tabId } = await getActiveUserTab();
      const resp = await sendMessageToTab<BotResponse>(tabId, { type: "STOP_BOT" });
      if (resp.status === "stopped") {
        setFeedback("Bot stopped");
        setBotRunning(false);
      } else {
        setFeedback("Failed to stop bot");
      }
    } catch (err: any) {
      setFeedback(err.message || "Error stopping bot");
    }
  }

  const models = [
    { id: "gpt-4o-mini", name: "GPT-4o Mini", cost: "$0.15/1M", recommended: true },
    { id: "gpt-4o", name: "GPT-4o", cost: "$2.50/1M", recommended: false },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo", cost: "$10/1M", recommended: false },
  ];

  return (
    <div className="bg-base-100 min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-secondary p-4 text-primary-content">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          LinkedIn AI Responder
        </h1>
        <p className="text-sm opacity-90 mt-1">Automate your LinkedIn replies</p>
      </div>

      <div className="p-4 space-y-4">
        {/* API Key Warning */}
        {!hasApiKey && (
          <div className="alert alert-warning shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-bold">Setup Required!</h3>
              <div className="text-xs">Please add your OpenAI API key in settings</div>
            </div>
          </div>
        )}

        {/* Status Badge */}
        <div className="flex justify-center">
          {botRunning ? (
            <div className="badge badge-success badge-lg gap-2">
              <span className="loading loading-spinner loading-xs"></span>
              Bot Running
            </div>
          ) : (
            <div className="badge badge-ghost badge-lg">Bot Idle</div>
          )}
        </div>

        {/* Model Selector */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-semibold">AI Model</span>
            <span className="label-text-alt text-xs">Cost per 1M tokens</span>
          </label>
          <select
            value={selectedModel}
            onChange={(e) => handleModelChange(e.target.value)}
            className="select select-bordered w-full"
            disabled={botRunning}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} - {model.cost} {model.recommended ? "⭐ Recommended" : ""}
              </option>
            ))}
          </select>
          <label className="label">
            <span className="label-text-alt text-xs">
              {selectedModel === "gpt-4o-mini" && "Best balance of cost & quality"}
              {selectedModel === "gpt-4o" && "Higher quality, 17x more expensive"}
              {selectedModel === "gpt-4-turbo" && "Highest quality, 67x more expensive"}
            </span>
          </label>
        </div>

        {/* Chats Input */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-semibold">Number of Chats to Process</span>
          </label>
          <input
            type="number"
            value={nChats}
            min={1}
            max={50}
            onChange={(e) => setNChats(Number(e.target.value))}
            className="input input-bordered w-full"
            disabled={botRunning}
          />
          <label className="label">
            <span className="label-text-alt">Recommended: 5-10 chats</span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            className="btn btn-primary flex-1"
            onClick={runBot}
            disabled={botRunning || !hasApiKey}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            Start Bot
          </button>
          <button
            className="btn btn-error flex-1"
            onClick={stopBot}
            disabled={!botRunning}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
            </svg>
            Stop Bot
          </button>
        </div>

        {/* Settings Button */}
        <button
          className="btn btn-outline btn-block"
          onClick={openOptionsPage}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
          Settings & Configuration
        </button>

        {/* Feedback Message */}
        {feedback && (
          <div className={`alert ${feedback.includes('success') || feedback.includes('🚀') ? 'alert-success' : 'alert-error'} shadow-lg`}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current flex-shrink-0 w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span className="text-sm">{feedback}</span>
          </div>
        )}

        {/* Activity Log */}
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-3">
            <h3 className="card-title text-sm">Recent Activity</h3>
            <div className="max-h-32 overflow-y-auto text-xs space-y-1">
              {botLog.length === 0 ? (
                <p className="text-base-content/60 italic">No activity yet</p>
              ) : (
                botLog.slice(0, 5).map((entry, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="text-base-content/60 whitespace-nowrap">
                      {new Date(entry.time).toLocaleTimeString()}
                    </span>
                    <span className="badge badge-xs badge-ghost">{entry.type}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("popup-root")!);
root.render(<Popup />);
