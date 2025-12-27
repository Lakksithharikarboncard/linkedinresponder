import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BotCommand, BotResponse, BotLogEntry } from "../shared/types";

type TabCommand = BotCommand | { type: "PING_TEST" };

function openOptionsPage() {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  else window.open(chrome.runtime.getURL("options.html"));
}

const BACKEND_LOGIN_URL = "https://data.mongodb-api.com/app/<app-id>/endpoint/login"; // TODO: Replace <app-id> with your Atlas App ID

const Popup: React.FC = () => {
  const [nChats, setNChats] = useState<number>(5);
  const [botRunning, setBotRunning] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [botLog, setBotLog] = useState<BotLogEntry[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [subscriptionWarning, setSubscriptionWarning] = useState<string | null>(null);

  // Load initial log and subscribe for live updates
  useEffect(() => {
    chrome.storage.local.get(["botLog", "openaiApiKey"], (res) => {
      setBotLog(res.botLog || []);
      if (!res.openaiApiKey) setShowOnboarding(true);
    });
    // Use localStorage or chrome.storage.local to persist login state if needed
    setIsLoggedIn(false); // Always require login on popup open for now
    const onChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local' && changes.botLog) {
        setBotLog(changes.botLog.newValue || []);
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // Messaging helper
  const sendMessageToTab = <T,>(tabId: number, msg: TabCommand): Promise<T> =>
    new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, msg, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res as T);
      });
    });

  // Helper: find active non-extension tab
  const getActiveUserTab = async (): Promise<{ id: number; url: string }> => {
    const normalWindow = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    const tabs = await chrome.tabs.query({ active: true, windowId: normalWindow.id });
    const tab = tabs[0];
    if (!tab?.id) throw new Error("No active tab");
    return { id: tab.id, url: tab.url || "unknown" };
  };

  // Start the bot
  async function runBot() {
    setFeedback(null);
    setBotRunning(true);
    try {
      const { id: tabId, url: currentUrl } = await getActiveUserTab();
      const ping = await sendMessageToTab<string>(tabId, { type: "PING_TEST" });
      if (ping !== "✅ Content script active!") {
        setFeedback(`❌ Please make sure you’re on a LinkedIn Messaging page. Current URL: ${currentUrl}`);
        setBotRunning(false);
        return;
      }
      const resp = await sendMessageToTab<BotResponse>(tabId, { type: "START_BOT", n: nChats+ 1 });
      if (resp.status === "ok") {
        setFeedback("✅ Bot started");
        // keep botRunning true until user stops the bot
      } else {
        setFeedback("❌ Failed to start bot");
        setBotRunning(false);
      }
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("No active tab")) setFeedback("❌ No active tab found");
      else setFeedback(`❌ ${msg}`);
      setBotRunning(false);
    }
  }

  // Stop the bot
  async function stopBot() {
    setFeedback(null);
    try {
      const { id: tabId } = await getActiveUserTab();
      const resp = await sendMessageToTab<BotResponse>(tabId, { type: "STOP_BOT" });
      if (resp.status === "stopped") {
        setFeedback("🛑 Bot stopped");
        setBotRunning(false);
      } else {
        setFeedback("❌ Failed to stop bot");
      }
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("No active tab")) setFeedback("❌ No active tab found");
      else setFeedback(`❌ ${msg}`);
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setSubscriptionWarning(null);
    try {
      const resp = await fetch(BACKEND_LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setIsLoggedIn(true);
      } else if (data.error === "Please purchase a subscription to access the bot.") {
        setSubscriptionWarning(data.error);
      } else {
        setLoginError(data.error || "Login failed");
      }
    } catch (err: any) {
      setLoginError(err.message || "Login failed");
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoginEmail("");
    setLoginPassword("");
    setLoginError(null);
    setSubscriptionWarning(null);
  };

  if (!isLoggedIn) {
    return (
      <div className="popup-root">
        <div className="popup-header">
          <span className="popup-title">Login</span>
        </div>
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          <input type="email" placeholder="Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
          <button type="submit">Login</button>
        </form>
        {loginError && <div style={{ color: "red", marginTop: 8 }}>{loginError}</div>}
        {subscriptionWarning && <div style={{ color: "orange", marginTop: 8 }}>{subscriptionWarning}</div>}
        <button style={{ marginTop: 16 }} onClick={() => window.open("https://airesponder.xyz", "_blank")}>Sign Up / Purchase Subscription</button>
      </div>
    );
  }

  return (
    <div className="popup-root">
      <div className="popup-header">
        <span className="popup-title">Auto-Reply</span>
        <button className="popup-close" title="Close" onClick={() => window.close()}>
          ×
        </button>
      </div>
      {showOnboarding && (
        <div style={{ background: "#f8e6c1", padding: 12, marginBottom: 10, borderRadius: 8 }}>
          <b>Welcome!</b> Set your OpenAI API key in Settings first.
        </div>
      )}
      <div style={{ margin: "10px 0 16px 0", display: "flex", alignItems: "center", gap: 10 }}>
        <label htmlFor="num-chats" style={{ fontSize: 13 }}>Chats to Process:</label>
        <input
          id="num-chats" type="number" value={nChats} min={1} max={50}
          style={{ width: 60, padding: "3px 5px", borderRadius: 6, border: "1px solid #c6d0e4" }}
          onChange={e => setNChats(Number(e.target.value))}
        />
      </div>
      <div className="button-row">
        <button disabled={botRunning} onClick={runBot}>
          {botRunning ? "Running..." : "Run Bot"}
        </button>
        <button disabled={!botRunning} onClick={stopBot} style={{ background: "#c62828", marginLeft: 8 }}>
          Stop
        </button>
        <button onClick={openOptionsPage} style={{ background: "#f2f6fa", color: "#0a66c2", border: "1px solid #bcdffb", marginLeft: 8 }}>
          Settings
        </button>
        <button onClick={handleLogout} style={{ marginTop: 10, background: "#eee" }}>Logout</button>
      </div>
      {feedback && (
        <div style={{ textAlign: "center", fontSize: 13, color: feedback.startsWith("✅") ? "#2e7d32" : "#c62828" }}>
          {feedback}
        </div>
      )}
      <div className="popup-note">
        Tip: Set your API key and prompt in <span className="popup-link" onClick={openOptionsPage}>Settings</span>.
      </div>
      <div className="popup-note">
        For more details, visit our{" "}
        <a className="popup-link" href="https://www.airesponder.xyz/" target="_blank" rel="noopener noreferrer">
          Website
        </a>
        .
      </div>
      <div style={{ fontSize: 13, color: "#888", marginTop: 20, maxHeight: 150, overflowY: "auto" }}>
        <b>Recent log:</b>
        <ul>
          {botLog.slice(0, 5).map((entry, i) => (
            <li key={i}>{new Date(entry.time).toLocaleTimeString()} – {entry.type}{entry.detail ? ": " + JSON.stringify(entry.detail) : ""}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("popup-root")!);
root.render(<Popup />);
