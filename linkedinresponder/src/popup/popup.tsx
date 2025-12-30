import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BotCommand, BotStatus, BotLogEntry, BotStats } from "../shared/types";
import "./popup.css";

const Popup = () => {
  const [running, setRunning] = useState(false);
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

  const [nChats, setNChats] = useState(10);
  const [model, setModel] = useState("gpt-4o-mini");
  const [useGroq, setUseGroq] = useState(false);
  const [groqModel, setGroqModel] = useState("llama-3.3-70b-versatile");
  const [strictHours, setStrictHours] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sendToContent = async (msg: BotCommand): Promise<any> => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) throw new Error("No active tab");

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabs[0].id!, msg, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response);
      });
    });
  };

  useEffect(() => {
    // ✅ Load saved toggle states first
    chrome.storage.local.get(
      ["savedUseGroq", "savedGroqModel", "savedStrictHours"],
      (data) => {
        if (data.savedUseGroq !== undefined) setUseGroq(data.savedUseGroq);
        if (data.savedGroqModel) setGroqModel(data.savedGroqModel);
        if (data.savedStrictHours !== undefined) setStrictHours(data.savedStrictHours);
      }
    );

    const syncState = async () => {
      try {
        const status: BotStatus = await sendToContent({ type: "GET_STATUS" });
        if (status) {
          setRunning(status.running);
          setStats(status.stats);
          setLogs(status.logs);
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
    const interval = setInterval(syncState, 1000);
    return () => clearInterval(interval);
  }, []);

  // ✅ Handlers to save toggle states
  const handleUseGroqChange = (value: boolean) => {
    setUseGroq(value);
    chrome.storage.local.set({ savedUseGroq: value });
  };

  const handleGroqModelChange = (value: string) => {
    setGroqModel(value);
    chrome.storage.local.set({ savedGroqModel: value });
  };

  const handleStrictHoursChange = (value: boolean) => {
    setStrictHours(value);
    chrome.storage.local.set({ savedStrictHours: value });
  };

  const handleStart = async () => {
    setLoading(true);
    await sendToContent({ type: "START_BOT", config: { nChats, model, useGroq, groqModel, strictHours } });
    setRunning(true);
    setLoading(false);
  };

  const handleStop = async () => {
    setLoading(true);
    await sendToContent({ type: "STOP_BOT" });
    
    // Calculate session summary
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
      model: stats.currentModel || (useGroq ? groqModel : model),
    });
    
    setRunning(false);
    setLoading(false);
    setShowSummary(true);
  };

  const handleCopyLogs = () => {
    const logText = logs
      .map((log) => {
        const time = new Date(log.time).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        return `[${time}] ${log.actor}: ${log.message}`;
      })
      .join("\n");
    
    navigator.clipboard.writeText(logText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const openOptionsPage = () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open(chrome.runtime.getURL("options.html"));
  };

  const uptime = (() => {
    if (!stats.startTime) return "—";
    const secs = Math.max(0, Math.floor((Date.now() - stats.startTime) / 1000));
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  })();

  // Calculate token limit based on current model
  const getTokenLimit = () => {
    if (!useGroq) return 0;
    if (groqModel === "openai/gpt-oss-120b") return 200000;
    if (groqModel.includes("kimi")) return 300000;
    if (groqModel.includes("scout") || groqModel.includes("maverick") || groqModel.includes("qwen")) return 500000;
    return 100000;
  };

  const tokenLimit = getTokenLimit();
  const tokenPercent = tokenLimit > 0 ? Math.min(100, Math.round((stats.tokensUsed / tokenLimit) * 100)) : 0;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "14px", color: "#173a35" }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "linear-gradient(135deg, #fbf2c4, #e5c185)" }}>
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
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px", background: "#f8f9fa", borderRadius: "6px" }}>
                <span style={{ fontSize: "11px", color: "#6c757d" }}>Duration:</span>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "#173a35" }}>{sessionSummary.duration}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px", background: "#f8f9fa", borderRadius: "6px" }}>
                <span style={{ fontSize: "11px", color: "#6c757d" }}>Processed:</span>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "#008585" }}>{sessionSummary.processed}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px", background: "#f8f9fa", borderRadius: "6px" }}>
                <span style={{ fontSize: "11px", color: "#6c757d" }}>Replied:</span>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "#74a892" }}>{sessionSummary.replied}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px", background: "#f8f9fa", borderRadius: "6px" }}>
                <span style={{ fontSize: "11px", color: "#6c757d" }}>Skipped:</span>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "#6c757d" }}>{sessionSummary.skipped}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px", background: "#f8f9fa", borderRadius: "6px" }}>
                <span style={{ fontSize: "11px", color: "#6c757d" }}>Leads Found:</span>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "#c7522a" }}>{sessionSummary.leads}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px", background: "#f8f9fa", borderRadius: "6px" }}>
                <span style={{ fontSize: "11px", color: "#6c757d" }}>Tokens Used:</span>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "#173a35" }}>{sessionSummary.tokens.toLocaleString()}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px", background: "#f8f9fa", borderRadius: "6px" }}>
                <span style={{ fontSize: "11px", color: "#6c757d" }}>Model:</span>
                <span style={{ fontSize: "10px", fontWeight: "600", color: "#173a35" }}>{sessionSummary.model}</span>
              </div>
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
          padding: "14px 16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                background: "rgba(255,255,255,0.2)",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(255,255,255,0.3)",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" strokeWidth="2" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "15px", fontWeight: "600" }}>linkedIn autoresponder</div>
              <div style={{ fontSize: "10px", opacity: 0.9 }}>Human-like LinkedIn agent</div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div
              style={{
                padding: "3px 10px",
                borderRadius: "20px",
                fontSize: "10px",
                fontWeight: "500",
                background: running ? "#74a892" : "rgba(255,255,255,0.2)",
                border: "1px solid rgba(255,255,255,0.3)",
              }}
            >
              {running ? "● Running" : "○ Idle"}
            </div>
            <div style={{ fontSize: "9px", marginTop: "3px", opacity: 0.8 }}>⏱ {uptime}</div>
          </div>
        </div>

        {errorMsg && (
          <div
            style={{
              marginTop: "10px",
              padding: "6px 10px",
              background: "#fbf2c4",
              color: "#c7522a",
              borderRadius: "6px",
              fontSize: "10px",
              border: "1px solid #e5c185",
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* STATS - Compact */}
        <div style={{ background: "white", borderRadius: "10px", padding: "10px", border: "1px solid #e5e5e5" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M3.6 2.25C2.85442 2.25 2.25 2.85441 2.25 3.6V20.4C2.25 21.1456 2.85441 21.75 3.6 21.75H20.4C21.1456 21.75 21.75 21.1456 21.75 20.4V3.6C21.75 2.85442 21.1456 2.25 20.4 2.25H3.6ZM16.75 8C16.75 7.58579 16.4142 7.25 16 7.25C15.5858 7.25 15.25 7.58579 15.25 8V16C15.25 16.4142 15.5858 16.75 16 16.75C16.4142 16.75 16.75 16.4142 16.75 16V8ZM12 10.25C12.4142 10.25 12.75 10.5858 12.75 11V16C12.75 16.4142 12.4142 16.75 12 16.75C11.5858 16.75 11.25 16.4142 11.25 16V11C11.25 10.5858 11.5858 10.25 12 10.25ZM8.75 13C8.75 12.5858 8.41421 12.25 8 12.25C7.58579 12.25 7.25 12.5858 7.25 13V16C7.25 16.4142 7.58579 16.75 8 16.75C8.41421 16.75 8.75 16.4142 8.75 16V13Z" fill="#173a35"/>
              </svg>
              <span style={{ fontSize: "11px", fontWeight: "600", color: "#173a35" }}>Stats</span>
            </div>
            <div style={{ fontSize: "8px", color: "#74a892" }}>● Live</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginBottom: "8px" }}>
            <div style={{ background: "#f8f9fa", padding: "8px", borderRadius: "6px", textAlign: "center" }}>
              <div style={{ fontSize: "8px", color: "#6c757d", textTransform: "uppercase", marginBottom: "2px" }}>Processed</div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "#008585" }}>{stats.chatsProcessed}</div>
            </div>

            <div style={{ background: "#f8f9fa", padding: "8px", borderRadius: "6px", textAlign: "center" }}>
              <div style={{ fontSize: "8px", color: "#6c757d", textTransform: "uppercase", marginBottom: "2px" }}>Replied</div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "#74a892" }}>{stats.repliesSent}</div>
            </div>

            <div style={{ background: "#f8f9fa", padding: "8px", borderRadius: "6px", textAlign: "center" }}>
              <div style={{ fontSize: "8px", color: "#6c757d", textTransform: "uppercase", marginBottom: "2px" }}>Leads</div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "#c7522a" }}>{stats.leadsFound}</div>
            </div>
          </div>

          {/* TOKEN COUNTER */}
          {useGroq && tokenLimit > 0 && (
            <div style={{ background: "#f8f9fa", padding: "8px", borderRadius: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "8px", color: "#6c757d", textTransform: "uppercase" }}>Tokens</span>
                <span style={{ fontSize: "8px", fontWeight: "600", color: "#173a35" }}>
                  {stats.tokensUsed.toLocaleString()} / {tokenLimit.toLocaleString()}
                </span>
              </div>
              <div style={{ width: "100%", height: "4px", background: "#dee2e6", borderRadius: "2px", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${tokenPercent}%`,
                    height: "100%",
                    background: tokenPercent > 80 ? "#c7522a" : tokenPercent > 50 ? "#e5c185" : "#74a892",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div style={{ fontSize: "7px", color: "#6c757d", marginTop: "2px", textAlign: "right" }}>
                {tokenPercent}% used
              </div>
            </div>
          )}
        </div>

        {/* CONTROLS - Compact */}
        <div style={{ background: "white", borderRadius: "10px", padding: "10px", border: "1px solid #e5e5e5" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 18C15.3137 18 18 15.3137 18 12C18 8.68629 15.3137 6 12 6C8.68629 6 6 8.68629 6 12C6 15.3137 8.68629 18 12 18Z" stroke="#173a35" strokeWidth="1.5"/>
              <path d="M18 12H12M9 6.80273L12 12M12 12L9 17.1973" stroke="#173a35" strokeWidth="1.5"/>
              <path d="M12 19C15.866 19 19 15.866 19 12C19 8.13401 15.866 5 12 5C8.13401 5 5 8.13401 5 12C5 15.866 8.13401 19 12 19Z" stroke="#173a35" strokeWidth="1.5" strokeDasharray="1 3"/>
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#173a35" strokeWidth="1.5"/>
              <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="#173a35" strokeWidth="1.5"/>
            </svg>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#173a35" }}>Controls</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            <div>
              <label style={{ fontSize: "9px", color: "#6c757d", display: "block", marginBottom: "3px" }}>Target chats</label>
              <input
                type="number"
                min={1}
                max={50}
                value={nChats}
                onChange={(e) => setNChats(Number(e.target.value))}
                disabled={running}
                style={{
                  width: "100%",
                  padding: "6px",
                  border: "1px solid #dee2e6",
                  borderRadius: "5px",
                  fontSize: "11px",
                  fontFamily: "monospace",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "9px", color: "#6c757d", display: "block", marginBottom: "3px" }}>
                {useGroq ? "Groq Model" : "OpenAI Model"}
              </label>
              {useGroq ? (
                <select
                  value={groqModel}
                  onChange={(e) => handleGroqModelChange(e.target.value)}
                  disabled={running}
                  style={{
                    width: "100%",
                    padding: "6px",
                    border: "1px solid #dee2e6",
                    borderRadius: "5px",
                    fontSize: "10px",
                    background: "white",
                  }}
                >
                  <option value="openai/gpt-oss-120b">🧠 GPT-OSS 120B</option>
                  <option value="llama-3.3-70b-versatile">⚡ Llama 3.3 70B</option>
                  <option value="meta-llama/llama-4-scout-17b-16e-instruct">🚀 Llama 4 Scout</option>
                  <option value="meta-llama/llama-4-maverick-17b-128e-instruct">⚖️ Llama 4 Maverick</option>
                  <option value="moonshotai/kimi-k2-instruct-0905">📚 Kimi K2</option>
                  <option value="qwen/qwen3-32b">💰 Qwen 3 32B</option>
                </select>
              ) : (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={running}
                  style={{
                    width: "100%",
                    padding: "6px",
                    border: "1px solid #dee2e6",
                    borderRadius: "5px",
                    fontSize: "11px",
                    background: "white",
                  }}
                >
                  <option value="gpt-4o-mini">GPT-4o mini</option>
                  <option value="gpt-4o">GPT-4o</option>
                </select>
              )}
            </div>
          </div>

          {/* ✅ USE GROQ TOGGLE - COMPACT */}
          <label
            onClick={() => !running && handleUseGroqChange(!useGroq)}
            style={{
              background: "#f8f9fa",
              padding: "8px 10px",
              borderRadius: "6px",
              marginBottom: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: running ? "not-allowed" : "pointer",
              opacity: running ? 0.6 : 1,
            }}
          >
            <div>
              <div style={{ fontSize: "10px", fontWeight: "500", color: "#173a35" }}>Use Groq</div>
              <div style={{ fontSize: "7.5px", color: "#6c757d" }}>
                {useGroq ? "Blazing fast (Groq API)" : "Using OpenAI"}
              </div>
            </div>
            
            <div
              style={{
                width: "38px",
                height: "20px",
                background: useGroq ? "#008585" : "#dee2e6",
                borderRadius: "10px",
                position: "relative",
                transition: "background 0.2s",
              }}
            >
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  background: "white",
                  borderRadius: "50%",
                  position: "absolute",
                  top: "2px",
                  left: useGroq ? "20px" : "2px",
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </div>
          </label>

          {/* ✅ STRICT HOURS TOGGLE - COMPACT */}
          <label
            onClick={() => !running && handleStrictHoursChange(!strictHours)}
            style={{
              background: "#f8f9fa",
              padding: "8px 10px",
              borderRadius: "6px",
              marginBottom: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: running ? "not-allowed" : "pointer",
              opacity: running ? 0.6 : 1,
            }}
          >
            <div>
              <div style={{ fontSize: "10px", fontWeight: "500", color: "#173a35" }}>Strict hours</div>
              <div style={{ fontSize: "7.5px", color: "#6c757d" }}>
                {strictHours ? "9 AM - 6 PM only" : "Runs 24/7"}
              </div>
            </div>
            
            <div
              style={{
                width: "38px",
                height: "20px",
                background: strictHours ? "#008585" : "#dee2e6",
                borderRadius: "10px",
                position: "relative",
                transition: "background 0.2s",
              }}
            >
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  background: "white",
                  borderRadius: "50%",
                  position: "absolute",
                  top: "2px",
                  left: strictHours ? "20px" : "2px",
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </div>
          </label>

          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={openOptionsPage}
              style={{
                flex: 1,
                padding: "8px",
                background: "#e5c185",
                border: "none",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: "500",
                color: "#173a35",
                cursor: "pointer",
              }}
            >
              Settings
            </button>

            <button
              onClick={handleStart}
              disabled={running || !!errorMsg}
              style={{
                flex: 1,
                padding: "8px",
                background: running || errorMsg ? "#dee2e6" : "#008585",
                border: "none",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: "500",
                color: "white",
                cursor: running || errorMsg ? "not-allowed" : "pointer",
              }}
            >
              ▶ Start
            </button>

            <button
              onClick={handleStop}
              disabled={!running}
              style={{
                flex: 1,
                padding: "8px",
                background: !running ? "#dee2e6" : "#c7522a",
                border: "none",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: "500",
                color: "white",
                cursor: !running ? "not-allowed" : "pointer",
              }}
            >
              ■ Stop
            </button>
          </div>
        </div>

        {/* TERMINAL - Expanded and Taller */}
        <div style={{ background: "#1a1f1e", borderRadius: "10px", overflow: "hidden", border: "1px solid #2a2f2e", flex: 1, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 1.25C6.06294 1.25 1.25 6.06294 1.25 12C1.25 13.8563 1.72113 15.6046 2.55076 17.1298L1.76267 21.3627C1.71742 21.6058 1.79485 21.8555 1.96967 22.0303C2.14448 22.2051 2.39422 22.2826 2.63727 22.2373L6.87016 21.4493C8.39536 22.2788 10.1437 22.75 12 22.75C17.937 22.75 22.75 17.937 22.75 12C22.75 6.06293 17.937 1.25 12 1.25ZM17 10.75C16.3097 10.75 15.75 11.3097 15.75 12C15.75 12.6903 16.3097 13.25 17 13.25C17.6903 13.25 18.25 12.6903 18.25 12C18.25 11.3097 17.6903 10.75 17 10.75ZM10.75 12C10.75 11.3097 11.3097 10.75 12 10.75C12.6903 10.75 13.25 11.3097 13.25 12C13.25 12.6903 12.6903 13.25 12 13.25C11.3097 13.25 10.75 12.6903 10.75 12ZM7 10.75C6.30961 10.75 5.75 11.3097 5.75 12C5.75 12.6903 6.30961 13.25 7 13.25C7.69039 13.25 8.25 12.6903 8.25 12C8.25 11.3097 7.69039 10.75 7 10.75Z" fill="#74a892"/>
              </svg>
              <span style={{ fontSize: "10px", color: "#74a892", fontWeight: "600" }}>Live terminal</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                onClick={handleCopyLogs}
                disabled={logs.length === 0}
                style={{
                  padding: "4px 8px",
                  background: copied ? "#74a892" : "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "4px",
                  fontSize: "9px",
                  color: "#fbf2c4",
                  cursor: logs.length === 0 ? "not-allowed" : "pointer",
                  opacity: logs.length === 0 ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {copied ? (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    Copy
                  </>
                )}
              </button>
              <div style={{ fontSize: "8px", color: "#6c757d" }}>{logs.length} events</div>
            </div>
          </div>

          <div
            className="log-container"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "10px",
              fontFamily: "monospace",
              fontSize: "10px",
              lineHeight: "1.5",
              color: "#fbf2c4",
            }}
          >
            {logs.length === 0 && <div style={{ opacity: 0.5, fontStyle: "italic" }}>Ready.</div>}
            {logs.map((log, i) => (
              <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "3px" }}>
                <span style={{ opacity: 0.6, minWidth: "65px" }}>
                  {new Date(log.time).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span
                  style={{
                    opacity: 0.8,
                    minWidth: "50px",
                    color: log.actor === "Bot" ? "#74a892" : log.actor === "User" ? "#e5c185" : "#fbf2c4",
                  }}
                >
                  {log.actor}
                </span>
                <span style={{ opacity: log.type === "ERROR" ? 1 : 0.9, color: log.type === "ERROR" ? "#c7522a" : "inherit" }}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: "8px", color: "#6c757d", marginTop: "2px" }}>
          v2.4.0 • linkedIn autoresponder
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("popup-root")!);
root.render(<Popup />);
