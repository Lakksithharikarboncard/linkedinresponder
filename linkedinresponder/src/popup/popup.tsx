// linkedinresponder/src/popup/popup.tsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BotCommand, BotStatus, BotLogEntry, BotStats } from "../shared/types";
import "./popup.css";

const STATUS_POLL_MS = 1000;
const STORAGE_FALLBACK_POLL_MS = 15_000;
const AUTO_SCROLL_THRESHOLD_PX = 60;

interface PendingReply {
  leadName: string;
  reply: string;
  timestamp: number;
}

const Popup = () => {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stats, setStats] = useState<BotStats>({
    chatsProcessed: 0,
    repliesSent: 0,
    leadsFound: 0,
    startTime: null,
    tokensUsed: 0,
    currentModel: "",
  });
  const [logs, setLogs] = useState<BotLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const [storageStats, setStorageStats] = useState({ conversationCount: 0, totalMessages: 0 });

  const [nChats, setNChats] = useState(10);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [replyPreviewEnabled, setReplyPreviewEnabled] = useState(false);
  const [pendingReply, setPendingReply] = useState<PendingReply | null>(null);
  const [editedReply, setEditedReply] = useState("");

  const [tick, setTick] = useState(0);

  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const statusIntervalRef = useRef<number | null>(null);
  const storageFallbackIntervalRef = useRef<number | null>(null);

  const isMessagingUrl = (url?: string) =>
    !!url && /https:\/\/(www\.)?linkedin\.com\/messaging/i.test(url);

  const sendToContent = async (msg: BotCommand | any): Promise<any> => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id || !isMessagingUrl(tab.url)) {
      setErrorMsg("Open LinkedIn Messaging and try again");
      return null;
    }

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id!, msg, (response) => {
        if (chrome.runtime.lastError) {
          setErrorMsg("Content script not detected. Refresh LinkedIn Messaging.");
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  };

  const loadStorageStats = () => {
    chrome.storage.local.get(["conversation_histories"], (result) => {
      const histories = result.conversation_histories || {};
      const count = Object.keys(histories).length;
      const totalMessages = Object.values(histories).reduce(
        (sum: number, convo: any) => sum + (convo.messages?.length || 0),
        0
      );
      setStorageStats({ conversationCount: count, totalMessages });
    });
  };

  useEffect(() => {
    chrome.storage.local.get(["replyPreviewEnabled"], (data) => {
      if (data.replyPreviewEnabled !== undefined) setReplyPreviewEnabled(data.replyPreviewEnabled);
    });

    const onStorageChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, areaName) => {
      if (areaName !== "local") return;
      if (changes.conversation_histories) {
        const newVal = changes.conversation_histories.newValue || {};
        const count = Object.keys(newVal).length;
        const totalMessages = Object.values(newVal).reduce(
          (sum: number, convo: any) => sum + (convo.messages?.length || 0),
          0
        );
        setStorageStats({ conversationCount: count, totalMessages });
      }
      if (changes.pendingReply) {
        const pending = changes.pendingReply.newValue;
        if (pending && replyPreviewEnabled) {
          setPendingReply(pending);
          setEditedReply(pending.reply);
        }
      }
    };

    chrome.storage.onChanged.addListener(onStorageChanged);

    const syncState = async () => {
      try {
        const status: BotStatus = await sendToContent({ type: "GET_STATUS" });
        if (status) {
          setRunning(status.running);
          setStats(status.stats);

          setLogs((prevLogs) => {
            if (prevLogs.length !== status.logs.length) {
              return status.logs;
            }
            if (prevLogs.length > 0 && status.logs.length > 0) {
              const prevLatest = prevLogs[0];
              const newLatest = status.logs[0];
              if (prevLatest.time !== newLatest.time || prevLatest.message !== newLatest.message) {
                return status.logs;
              }
            }
            return prevLogs;
          });

          setErrorMsg(null);
        } else {
          setErrorMsg("Navigate to LinkedIn Messaging");
        }
      } catch {
        setErrorMsg("Connect to LinkedIn Messaging");
      } finally {
        setLoading(false);
      }
    };

    syncState();
    loadStorageStats();

    statusIntervalRef.current = window.setInterval(syncState, STATUS_POLL_MS);
    storageFallbackIntervalRef.current = window.setInterval(loadStorageStats, STORAGE_FALLBACK_POLL_MS);

    const tickInterval = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => {
      if (statusIntervalRef.current !== null) window.clearInterval(statusIntervalRef.current);
      if (storageFallbackIntervalRef.current !== null) window.clearInterval(storageFallbackIntervalRef.current);
      window.clearInterval(tickInterval);
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, [replyPreviewEnabled]);

  useEffect(() => {
    const el = logContainerRef.current;
    if (!el) return;

    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom < AUTO_SCROLL_THRESHOLD_PX;
    };

    const onMouseDown = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom > AUTO_SCROLL_THRESHOLD_PX) {
        shouldAutoScrollRef.current = false;
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("mousedown", onMouseDown, { passive: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  useEffect(() => {
    const el = logContainerRef.current;
    if (!el) return;
    if (!shouldAutoScrollRef.current) return;

    requestAnimationFrame(() => {
      if (shouldAutoScrollRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, [logs]);

  const handleReplyPreviewChange = (value: boolean) => {
    setReplyPreviewEnabled(value);
    chrome.storage.local.set({ replyPreviewEnabled: value });
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await sendToContent({
        type: "START_BOT",
        config: { nChats, replyPreviewEnabled },
      });
      if (res && res.status === "ok") {
        setRunning(true);
        setPaused(false);
        setErrorMsg(null);
      } else if (!res) {
        // errorMsg already set in sendToContent
      } else {
        setErrorMsg(res.error || "Unable to start");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    await sendToContent({ type: "PAUSE_BOT" });
    setPaused(true);
  };

  const handleResume = async () => {
    await sendToContent({ type: "RESUME_BOT" });
    setPaused(false);
  };

  const handleStop = async () => {
    setLoading(true);
    await sendToContent({ type: "STOP_BOT" });

    const duration = stats.startTime ? Date.now() - stats.startTime : 0;
    const durationMins = Math.floor(duration / 60000);
    const durationSecs = Math.floor((duration % 60000) / 1000);

    setSessionSummary({
      duration: `${durationMins}m ${durationSecs}s`,
      processed: stats.chatsProcessed,
      replied: stats.repliesSent,
      skipped: stats.chatsProcessed - stats.repliesSent,
      leads: stats.leadsFound,
      tokens: stats.tokensUsed,
      model: stats.currentModel || "Unknown",
    });

    setRunning(false);
    setPaused(false);
    setLoading(false);
    setShowSummary(true);
  };

  const handleApproveReply = async () => {
    if (!pendingReply) return;
    await sendToContent({
      type: "APPROVE_REPLY",
      reply: editedReply,
      leadName: pendingReply.leadName,
    });
    setPendingReply(null);
    setEditedReply("");
    chrome.storage.local.remove(["pendingReply"]);
  };

  const handleRejectReply = async () => {
    if (!pendingReply) return;
    await sendToContent({
      type: "REJECT_REPLY",
      leadName: pendingReply.leadName,
    });
    setPendingReply(null);
    setEditedReply("");
    chrome.storage.local.remove(["pendingReply"]);
  };

  const handleExportConversations = () => {
    chrome.storage.local.get(["conversation_histories"], (result) => {
      const data = result.conversation_histories || {};
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `linkedin-conversations-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleCopyLogs = () => {
    const logText = logs
      .map((log) => {
        const time = new Date(log.time).toLocaleTimeString([], {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        return `[${time}] ${log.actor}: ${log.message}`;
      })
      .join("\n");

    navigator.clipboard
      .writeText(logText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        setErrorMsg("Clipboard copy failed");
        setTimeout(() => setErrorMsg(null), 2500);
      });
  };

  const handleClearStorage = () => {
    if (!confirm(`Clear ${storageStats.conversationCount} conversation histories?\n\nThis cannot be undone.`)) return;
    chrome.storage.local.set({ conversation_histories: {} }, () => {
      setStorageStats({ conversationCount: 0, totalMessages: 0 });
    });
  };

  const openOptionsPage = () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open(chrome.runtime.getURL("options.html"));
  };

  const uptime = useMemo(() => {
    if (!stats.startTime) return "—";
    const secs = Math.max(0, Math.floor((Date.now() - stats.startTime) / 1000));
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [stats.startTime, tick]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <div className="loading-text">Loading...</div>
      </div>
    );
  }

  return (
    <div className="popup-root">
      
      {/* REPLY PREVIEW MODAL */}
      {pendingReply && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && handleRejectReply()}>
          <div className="modal-content">
            <h2 className="modal-title">📝 Review Reply to {pendingReply.leadName}</h2>
            <textarea
              className="modal-textarea"
              value={editedReply}
              onChange={(e) => setEditedReply(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={handleRejectReply}>✕ Skip</button>
              <button className="btn-primary" onClick={handleApproveReply}>✓ Send</button>
            </div>
          </div>
        </div>
      )}

      {/* SESSION SUMMARY MODAL */}
      {showSummary && sessionSummary && (
        <div className="modal-overlay" onClick={() => setShowSummary(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">✅ Session Complete</h2>
            <div className="summary-grid">
              <SummaryRow label="Duration" value={sessionSummary.duration} valueColor="#173a35" />
              <SummaryRow label="Processed" value={sessionSummary.processed} valueColor="#008585" />
              <SummaryRow label="Replied" value={sessionSummary.replied} valueColor="#74a892" />
              <SummaryRow label="Skipped" value={sessionSummary.skipped} valueColor="#6c757d" />
              <SummaryRow label="Leads Found" value={sessionSummary.leads} valueColor="#c7522a" />
              <SummaryRow label="Tokens Used" value={sessionSummary.tokens.toLocaleString()} valueColor="#173a35" />
              <SummaryRow label="Model" value={sessionSummary.model} valueColor="#173a35" small />
            </div>
            <button className="btn-primary" onClick={() => setShowSummary(false)}>Close</button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="header">
        <div className="header-content">
          <div className="header-left">
            <div className="header-icon">
              <IconMessage size={18} color="white" />
            </div>
            <div>
              <div className="header-title">LinkedIn Autoresponder</div>
              <div className="header-subtitle">Human-like AI agent</div>
            </div>
          </div>

          <div className="header-right">
            <div className={`status-badge ${running ? (paused ? "paused" : "running") : "idle"}`}>
              {running ? (paused ? "❚❚ Paused" : "● Running") : "○ Idle"}
            </div>
            <div className="header-uptime">⏱ {uptime}</div>
          </div>
        </div>

        {errorMsg && (
          <div className="error-banner">
            ⚠️ {errorMsg}
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div className="content">
        
        {/* STATS CARD */}
        <div className="card">
          <div className="card-header">
            <IconChart size={16} color="#173a35" />
            <span className="card-title">Stats</span>
            <span className="live-indicator">● Live</span>
          </div>

          <div className="stats-grid">
            <StatItem label="processed" value={stats.chatsProcessed} color="#008585" />
            <StatItem label="replied" value={stats.repliesSent} color="#74a892" />
            <StatItem label="leads" value={stats.leadsFound} color="#c7522a" />
            <StatItem label="convos" value={storageStats.conversationCount} color="#173a35" />
            <StatItem label="msgs" value={storageStats.totalMessages} color="#173a35" />
          </div>

          {stats.currentModel && (
            <div className="model-info">
              Model: <strong>{stats.currentModel}</strong>
            </div>
          )}
        </div>

        {/* CONTROLS CARD */}
        <div className="card">
          <div className="card-header">
            <IconControls size={16} color="#173a35" />
            <span className="card-title">Controls</span>
          </div>

          <div className="controls-grid">
            <div className="field-group">
              <label className="field-label">Target chats</label>
              <input
                type="number"
                min={1}
                max={50}
                value={nChats}
                onChange={(e) => setNChats(Number(e.target.value))}
                disabled={running}
                className="number-input"
              />
            </div>

            <div className="field-group">
              <label className="field-label">Reply preview</label>
              <ToggleSwitch
                enabled={replyPreviewEnabled}
                disabled={running}
                onToggle={() => !running && handleReplyPreviewChange(!replyPreviewEnabled)}
              />
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="button-row">
            <button className="btn-secondary" onClick={openOptionsPage}>
              ⚙️ Settings
            </button>

            {!running ? (
              <button
                className="btn-primary btn-start"
                onClick={handleStart}
                disabled={!!errorMsg}
              >
                ▶ Start
              </button>
            ) : (
              <>
                <button
                  className={`btn-secondary ${paused ? "btn-resume" : ""}`}
                  onClick={paused ? handleResume : handlePause}
                >
                  {paused ? "▶" : "❚❚"}
                </button>
                <button className="btn-stop" onClick={handleStop}>
                  ■ Stop
                </button>
              </>
            )}
          </div>

          {/* UTILITY BUTTONS */}
          <div className="button-row utility-row">
            <button
              className="btn-utility"
              onClick={handleExportConversations}
              disabled={running || storageStats.conversationCount === 0}
            >
              <IconExport size={14} color="currentColor" />
              Export
            </button>
            <button
              className="btn-utility"
              onClick={handleClearStorage}
              disabled={running || storageStats.conversationCount === 0}
            >
              <IconDelete size={14} color="currentColor" />
              Clear ({storageStats.conversationCount})
            </button>
          </div>
        </div>

        {/* TERMINAL */}
        <div className="terminal">
          <div className="terminal-header">
            <div className="terminal-title">
              <IconTerminal size={14} color="#74a892" />
              <span>Live Terminal</span>
            </div>
            <div className="terminal-actions">
              <button
                className="terminal-btn"
                onClick={handleCopyLogs}
                disabled={logs.length === 0}
              >
                {copied ? "✓" : "Copy"}
              </button>
              <span className="log-count">{logs.length}</span>
            </div>
          </div>

          <div ref={logContainerRef} className="log-container">
            {logs.length === 0 && <div className="log-empty">Ready.</div>}
            {logs.map((log, i) => {
              const isDoubleText = log.message.includes("Double-texting") || log.message.includes("double-text");
              const isProfileLog = log.message.includes("(") && log.message.includes("@");
              const isStorageLog = log.message.includes("Saved") && log.message.includes("messages");

              return (
                <div key={i} className="log-entry">
                  <span className="log-time">
                    {new Date(log.time).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span className={`log-actor actor-${log.actor.toLowerCase()}`}>
                    {log.actor}
                  </span>
                  <span
                    className={`log-message ${log.type === "ERROR" ? "error" : ""} ${isDoubleText ? "double-text" : ""} ${isStorageLog ? "storage" : ""}`}
                  >
                    {isDoubleText && "💬 "}
                    {isProfileLog && "👤 "}
                    {isStorageLog && "💾 "}
                    {log.message}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="footer-version">v2.8.0 • LinkedIn Autoresponder</div>
      </div>
    </div>
  );
};

// --- ICON COMPONENTS ---

function IconMessage({ size = 16, color = "#000" }: { size?: number; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={color} strokeWidth="2" fill="none"/>
    </svg>
  );
}

function IconChart({ size = 16, color = "#000" }: { size?: number; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path 
        fill={color} 
        d="M13 3a2 2 0 0 1 1.995 1.85L15 5v16H9V5a2 2 0 0 1 1.85-1.995L11 3zm7 5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3V8zM7 11v10H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z"
      />
    </svg>
  );
}

function IconControls({ size = 16, color = "#000" }: { size?: number; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path 
        fill={color} 
        d="M16 15c1.306 0 2.418.835 2.83 2H20a1 1 0 1 1 0 2h-1.17a3.001 3.001 0 0 1-5.66 0H4a1 1 0 1 1 0-2h9.17A3.001 3.001 0 0 1 16 15M8 9a3 3 0 0 1 2.762 1.828l.067.172H20a1 1 0 0 1 .117 1.993L20 13h-9.17a3.001 3.001 0 0 1-5.592.172L5.17 13H4a1 1 0 0 1-.117-1.993L4 11h1.17A3.001 3.001 0 0 1 8 9m8-6c1.306 0 2.418.835 2.83 2H20a1 1 0 1 1 0 2h-1.17a3.001 3.001 0 0 1-5.66 0H4a1 1 0 0 1 0-2h9.17A3.001 3.001 0 0 1 16 3"
      />
    </svg>
  );
}

function IconTerminal({ size = 16, color = "#000" }: { size?: number; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path 
        fill={color} 
        fillRule="evenodd"
        d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-3 11h-2a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2M9.05 8.465a1 1 0 0 0-1.497 1.32l.083.094L9.757 12l-2.12 2.121a1 1 0 0 0 1.32 1.498l.093-.083 2.829-2.829a1 1 0 0 0 .083-1.32l-.083-.094z"
      />
    </svg>
  );
}

function IconExport({ size = 14, color = "#000" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/>
    </svg>
  );
}

function IconDelete({ size = 14, color = "#000" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
    </svg>
  );
}

// --- HELPER COMPONENTS ---

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="stat-item">
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function ToggleSwitch({ enabled, disabled, onToggle }: { enabled: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <div
      className={`toggle-switch ${enabled ? "enabled" : ""} ${disabled ? "disabled" : ""}`}
      onClick={onToggle}
    >
      <div className="toggle-track">
        <div className="toggle-thumb"></div>
      </div>
      <span className="toggle-label">{enabled ? "On" : "Off"}</span>
    </div>
  );
}

function SummaryRow({ label, value, valueColor, small }: { label: string; value: string | number; valueColor: string; small?: boolean }) {
  return (
    <div className="summary-row">
      <span className="summary-label">{label}:</span>
      <span className={`summary-value ${small ? "small" : ""}`} style={{ color: valueColor }}>{value}</span>
    </div>
  );
}

// --- RENDER ---

const root = createRoot(document.getElementById("popup-root")!);
root.render(<Popup />);
