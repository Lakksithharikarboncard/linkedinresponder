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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{ fontSize: "14px", color: "#173a35" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "linear-gradient(135deg, #fbf2c4, #e5c185)" }}>
      
      {/* REPLY PREVIEW MODAL */}
      {pendingReply && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "16px",
              maxWidth: "380px",
              width: "95%",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            <h2 style={{ fontSize: "14px", fontWeight: "600", color: "#173a35", marginBottom: "8px" }}>
              📝 Review Reply to {pendingReply.leadName}
            </h2>
            <textarea
              value={editedReply}
              onChange={(e) => setEditedReply(e.target.value)}
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "10px",
                border: "1px solid #dee2e6",
                borderRadius: "6px",
                fontSize: "12px",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <button
                onClick={handleRejectReply}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "#f8f9fa",
                  border: "1px solid #dee2e6",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "500",
                  color: "#c7522a",
                  cursor: "pointer",
                }}
              >
                ✕ Skip
              </button>
              <button
                onClick={handleApproveReply}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "#008585",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "500",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                ✓ Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SESSION SUMMARY MODAL */}
      {showSummary && sessionSummary && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowSummary(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "20px",
              maxWidth: "320px",
              width: "90%",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "#173a35", marginBottom: "16px", textAlign: "center" }}>
              ✅ Session Complete
            </h2>

            <div style={{ display: "grid", gap: "10px" }}>
              <SummaryRow label="Duration" value={sessionSummary.duration} valueColor="#173a35" />
              <SummaryRow label="Processed" value={sessionSummary.processed} valueColor="#008585" />
              <SummaryRow label="Replied" value={sessionSummary.replied} valueColor="#74a892" />
              <SummaryRow label="Skipped" value={sessionSummary.skipped} valueColor="#6c757d" />
              <SummaryRow label="Leads Found" value={sessionSummary.leads} valueColor="#c7522a" />
              <SummaryRow label="Tokens Used" value={sessionSummary.tokens.toLocaleString()} valueColor="#173a35" />
              <SummaryRow label="Model" value={sessionSummary.model} valueColor="#173a35" small />
            </div>

            <button
              onClick={() => setShowSummary(false)}
              style={{
                width: "100%",
                marginTop: "16px",
                padding: "10px",
                background: "#008585",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: "500",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div
        style={{
          background: "linear-gradient(135deg, #c7522a, #008585)",
          color: "white",
          padding: "12px 14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                background: "rgba(255,255,255,0.2)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(255,255,255,0.3)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" strokeWidth="2" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: "600" }}>LinkedIn Autoresponder</div>
              <div style={{ fontSize: "9px", opacity: 0.9 }}>Human-like AI agent</div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div
              style={{
                padding: "2px 8px",
                borderRadius: "20px",
                fontSize: "9px",
                fontWeight: "500",
                background: running ? (paused ? "#e5c185" : "#74a892") : "rgba(255,255,255,0.2)",
                border: "1px solid rgba(255,255,255,0.3)",
              }}
            >
              {running ? (paused ? "❚❚ Paused" : "● Running") : "○ Idle"}
            </div>
            <div style={{ fontSize: "9px", marginTop: "2px", opacity: 0.8 }}>⏱ {uptime}</div>
          </div>
        </div>

        {errorMsg && (
          <div
            style={{
              marginTop: "8px",
              padding: "5px 8px",
              background: "#fbf2c4",
              color: "#c7522a",
              borderRadius: "6px",
              fontSize: "9px",
              border: "1px solid #e5c185",
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
        
        {/* STATS */}
        <div style={{ background: "white", borderRadius: "8px", padding: "8px", border: "1px solid #e5e5e5" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", marginBottom: "6px" }}>
            <IconChart size={16} color="#000" />
            <span style={{ fontSize: "10px", fontWeight: "600", color: "#173a35" }}>Stats</span>
            <span style={{ fontSize: "7px", color: "#74a892" }}>● Live</span>
          </div>

          <div style={{ 
            fontSize: "9px", 
            color: "#173a35", 
            display: "flex", 
            flexWrap: "wrap", 
            justifyContent: "center",
            alignItems: "center",
            gap: "10px"
          }}>
            <span><strong style={{ color: "#008585" }}>{stats.chatsProcessed}</strong> processed</span>
            <span><strong style={{ color: "#74a892" }}>{stats.repliesSent}</strong> replied</span>
            <span><strong style={{ color: "#c7522a" }}>{stats.leadsFound}</strong> leads</span>
            <span><strong>{storageStats.conversationCount}</strong> convos</span>
            <span><strong>{storageStats.totalMessages}</strong> msgs</span>
          </div>

          {stats.currentModel && (
            <div style={{ textAlign: "center", marginTop: "6px", fontSize: "8px", color: "#6c757d" }}>
              Model: <strong>{stats.currentModel}</strong>
            </div>
          )}
        </div>

        {/* CONTROLS */}
        <div style={{ background: "white", borderRadius: "8px", padding: "8px", border: "1px solid #e5e5e5" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", marginBottom: "6px" }}>
            <IconControls size={16} color="#000" />
            <span style={{ fontSize: "10px", fontWeight: "600", color: "#173a35" }}>Controls</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "6px" }}>
            <div>
              <label style={{ fontSize: "8px", color: "#6c757d", display: "block", marginBottom: "2px" }}>Target chats</label>
              <input
                type="number"
                min={1}
                max={50}
                value={nChats}
                onChange={(e) => setNChats(Number(e.target.value))}
                disabled={running}
                style={{
                  width: "100%",
                  padding: "5px",
                  border: "1px solid #dee2e6",
                  borderRadius: "4px",
                  fontSize: "10px",
                  fontFamily: "monospace",
                }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <ToggleRow
                label="Preview"
                sublabel={replyPreviewEnabled ? "On" : "Off"}
                enabled={replyPreviewEnabled}
                disabled={running}
                onToggle={() => !running && handleReplyPreviewChange(!replyPreviewEnabled)}
              />
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              onClick={openOptionsPage}
              style={{
                flex: 1,
                padding: "7px",
                background: "#e5c185",
                border: "none",
                borderRadius: "5px",
                fontSize: "10px",
                fontWeight: "500",
                color: "#173a35",
                cursor: "pointer",
              }}
            >
              ⚙️ Settings
            </button>

            {!running ? (
              <button
                onClick={handleStart}
                disabled={!!errorMsg}
                style={{
                  flex: 2,
                  padding: "7px",
                  background: errorMsg ? "#dee2e6" : "#008585",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "10px",
                  fontWeight: "500",
                  color: "white",
                  cursor: errorMsg ? "not-allowed" : "pointer",
                }}
              >
                ▶ Start
              </button>
            ) : (
              <>
                <button
                  onClick={paused ? handleResume : handlePause}
                  style={{
                    flex: 1,
                    padding: "7px",
                    background: paused ? "#74a892" : "#e5c185",
                    border: "none",
                    borderRadius: "5px",
                    fontSize: "10px",
                    fontWeight: "500",
                    color: paused ? "white" : "#173a35",
                    cursor: "pointer",
                  }}
                >
                  {paused ? "▶" : "❚❚"}
                </button>
                <button
                  onClick={handleStop}
                  style={{
                    flex: 1,
                    padding: "7px",
                    background: "#c7522a",
                    border: "none",
                    borderRadius: "5px",
                    fontSize: "10px",
                    fontWeight: "500",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  ■ Stop
                </button>
              </>
            )}
          </div>

          {/* UTILITY BUTTONS */}
          <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
            <button
              onClick={handleExportConversations}
              disabled={running || storageStats.conversationCount === 0}
              style={{
                flex: 1,
                padding: "5px",
                background: "#f8f9fa",
                border: "1px solid #dee2e6",
                borderRadius: "4px",
                fontSize: "8px",
                color: running || storageStats.conversationCount === 0 ? "#adb5bd" : "#000",
                cursor: running || storageStats.conversationCount === 0 ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
              }}
            >
              <IconExport size={14} color={running || storageStats.conversationCount === 0 ? "#adb5bd" : "#000"} />
              Export
            </button>
            <button
              onClick={handleClearStorage}
              disabled={running || storageStats.conversationCount === 0}
              style={{
                flex: 1,
                padding: "5px",
                background: "#f8f9fa",
                border: "1px solid #dee2e6",
                borderRadius: "4px",
                fontSize: "8px",
                color: running || storageStats.conversationCount === 0 ? "#adb5bd" : "#000",
                cursor: running || storageStats.conversationCount === 0 ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
              }}
            >
              <IconDelete size={14} color={running || storageStats.conversationCount === 0 ? "#adb5bd" : "#000"} />
              Clear ({storageStats.conversationCount})
            </button>
          </div>
        </div>

        {/* TERMINAL */}
        <div
          className="terminal-wrapper"
          style={{
            background: "#1a1f1e",
            borderRadius: "8px",
            overflow: "hidden",
            border: "1px solid #2a2f2e",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: "160px",
          }}
        >
          <div
            style={{
              padding: "6px 10px",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <IconTerminal size={14} color="#74a892" />
              <span style={{ fontSize: "9px", color: "#74a892", fontWeight: "600" }}>Live Terminal</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                onClick={handleCopyLogs}
                disabled={logs.length === 0}
                style={{
                  padding: "3px 6px",
                  background: copied ? "#74a892" : "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "3px",
                  fontSize: "8px",
                  color: "#fbf2c4",
                  cursor: logs.length === 0 ? "not-allowed" : "pointer",
                  opacity: logs.length === 0 ? 0.5 : 1,
                }}
              >
                {copied ? "✓" : "Copy"}
              </button>
              <span style={{ fontSize: "7px", color: "#6c757d" }}>{logs.length}</span>
            </div>
          </div>

          <div
            ref={logContainerRef}
            className="log-container"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "8px",
              fontFamily: "monospace",
              fontSize: "9px",
              lineHeight: "1.4",
              color: "#fbf2c4",
            }}
          >
            {logs.length === 0 && <div style={{ opacity: 0.5, fontStyle: "italic" }}>Ready.</div>}
            {logs.map((log, i) => {
              const isDoubleText = log.message.includes("Double-texting") || log.message.includes("double-text");
              const isProfileLog = log.message.includes("(") && log.message.includes("@");
              const isStorageLog = log.message.includes("Saved") && log.message.includes("messages");

              return (
                <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "2px" }}>
                  <span style={{ opacity: 0.5, minWidth: "55px", fontSize: "8px" }}>
                    {new Date(log.time).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span
                    style={{
                      opacity: 0.7,
                      minWidth: "35px",
                      fontSize: "8px",
                      color: log.actor === "Bot" ? "#74a892" : log.actor === "User" ? "#e5c185" : "#fbf2c4",
                    }}
                  >
                    {log.actor}
                  </span>
                  <span
                    style={{
                      opacity: log.type === "ERROR" ? 1 : 0.85,
                      color: log.type === "ERROR" ? "#c7522a" : isDoubleText ? "#e5c185" : "inherit",
                      fontWeight: isDoubleText || isStorageLog ? "600" : "normal",
                      fontSize: "8px",
                    }}
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

        <div style={{ textAlign: "center", fontSize: "7px", color: "#6c757d" }}>v2.7.0 • LinkedIn Autoresponder</div>
      </div>
    </div>
  );
};

// --- ICON COMPONENTS ---

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

function ToggleRow(props: {
  label: string;
  sublabel: string;
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={props.onToggle}
      style={{
        background: "#f8f9fa",
        padding: "5px 6px",
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.6 : 1,
        flex: 1,
      }}
    >
      <div>
        <div style={{ fontSize: "8px", fontWeight: "500", color: "#173a35" }}>{props.label}</div>
        <div style={{ fontSize: "6px", color: "#6c757d" }}>{props.sublabel}</div>
      </div>
      <div
        style={{
          width: "24px",
          height: "12px",
          background: props.enabled ? "#008585" : "#dee2e6",
          borderRadius: "6px",
          position: "relative",
          transition: "background 0.2s",
        }}
      >
        <div
          style={{
            width: "8px",
            height: "8px",
            background: "white",
            borderRadius: "50%",
            position: "absolute",
            top: "2px",
            left: props.enabled ? "14px" : "2px",
            transition: "left 0.2s",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          }}
        />
      </div>
    </div>
  );
}

function SummaryRow(props: { label: string; value: string | number; valueColor: string; small?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px", background: "#f8f9fa", borderRadius: "6px" }}>
      <span style={{ fontSize: "11px", color: "#6c757d" }}>{props.label}:</span>
      <span style={{ fontSize: props.small ? "10px" : "11px", fontWeight: "600", color: props.valueColor }}>{props.value}</span>
    </div>
  );
}

// --- RENDER ---

const root = createRoot(document.getElementById("popup-root")!);
root.render(<Popup />);
