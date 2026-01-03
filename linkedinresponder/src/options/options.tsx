// linkedinresponder/src/options/options.tsx

import React, { useEffect, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./options.css";
import { DEFAULT_SETTINGS, getBotSettings, setBotSettings, BotSettings } from "../shared/settings";

type SaveState = "idle" | "saving" | "saved" | "error";
type ApiTestStatus = "idle" | "testing" | "success" | "error";

interface ApiKeyStatus {
  openai: ApiTestStatus;
  groq: ApiTestStatus;
  resend: ApiTestStatus;
}

const Options = () => {
  // Settings state
  const [settings, setSettings] = useState<BotSettings>(DEFAULT_SETTINGS);
  const [originalSettings, setOriginalSettings] = useState<BotSettings>(DEFAULT_SETTINGS);
  
  // UI state
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // API key visibility
  const [showKeys, setShowKeys] = useState({
    openai: false,
    groq: false,
    resend: false,
  });
  
  // API test status
  const [apiStatus, setApiStatus] = useState<ApiKeyStatus>({
    openai: "idle",
    groq: "idle",
    resend: "idle",
  });

  // Collapsible sections
  const [collapsed, setCollapsed] = useState({
    apiKeys: false,
    leadAlerts: false,
    workingHours: false,
    timing: false,
    prompts: false,
    statistics: true,
  });

  // Statistics
  const [stats, setStats] = useState({
    conversationCount: 0,
    totalMessages: 0,
    lastSession: null as number | null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load settings on mount
  useEffect(() => {
    (async () => {
      try {
        const s = await getBotSettings();
        setSettings(s);
        setOriginalSettings(s);
      } catch (e) {
        setError("Failed to load settings");
      }
    })();

    // Load dark mode preference
    chrome.storage.local.get(["darkMode", "lastSessionTime"], (data) => {
      if (data.darkMode !== undefined) setDarkMode(data.darkMode);
      if (data.lastSessionTime) setStats(prev => ({ ...prev, lastSession: data.lastSessionTime }));
    });

    // Load statistics
    chrome.storage.local.get(["conversation_histories"], (result) => {
      const histories = result.conversation_histories || {};
      const count = Object.keys(histories).length;
      const totalMessages = Object.values(histories).reduce(
        (sum: number, convo: any) => sum + (convo.messages?.length || 0),
        0
      );
      setStats(prev => ({ ...prev, conversationCount: count, totalMessages }));
    });
  }, []);

  // Track unsaved changes
  useEffect(() => {
    const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);
    setHasUnsavedChanges(hasChanges);
  }, [settings, originalSettings]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "r" && e.shiftKey) {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settings]);

  // Apply dark mode
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    chrome.storage.local.set({ darkMode });
  }, [darkMode]);

  const updateSetting = <K extends keyof BotSettings>(key: K, value: BotSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setError(null);
    setSaveState("saving");

    try {
      await setBotSettings(settings);
      setOriginalSettings(settings);
      setSaveState("saved");
      setHasUnsavedChanges(false);
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setSaveState("error");
      setError("Failed to save settings");
    }
  };

  const handleReset = () => {
    if (!confirm("Reset all settings to defaults?\n\nThis cannot be undone.")) return;
    setSettings(DEFAULT_SETTINGS);
  };

  const handleCancel = () => {
    if (hasUnsavedChanges && !confirm("Discard unsaved changes?")) return;
    setSettings(originalSettings);
  };

  const handleExport = () => {
    const data = {
      settings,
      exportedAt: new Date().toISOString(),
      version: "2.6.0",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `linkedin-autoresponder-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.settings) {
          setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
          setError(null);
        } else {
          setError("Invalid settings file format");
        }
      } catch {
        setError("Failed to parse settings file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const testApiKey = async (type: "openai" | "groq" | "resend") => {
    setApiStatus(prev => ({ ...prev, [type]: "testing" }));

    try {
      let response: Response;

      if (type === "openai") {
        response = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${settings.openaiApiKey}` },
        });
      } else if (type === "groq") {
        response = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${settings.groqApiKey}` },
        });
      } else {
        response = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${settings.resendApiKey}` },
        });
      }

      setApiStatus(prev => ({ ...prev, [type]: response.ok ? "success" : "error" }));
    } catch {
      setApiStatus(prev => ({ ...prev, [type]: "error" }));
    }
  };

  const toggleSection = (section: keyof typeof collapsed) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? "PM" : "AM";
    const h = hour % 12 || 12;
    return `${h}:00 ${period}`;
  };

  return (
    <div className={`options-container ${darkMode ? "dark" : "light"}`}>
      {/* HEADER */}
      <header className="options-header">
        <div className="header-left">
          <div className="header-icon">
            <IconSettings size={24} color={darkMode ? "#fbf2c4" : "#173a35"} />
          </div>
          <div>
            <h1>Settings</h1>
            <p>LinkedIn Autoresponder v2.6.0</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn-icon" onClick={() => setDarkMode(!darkMode)} title="Toggle dark mode (Ctrl+D)">
            {darkMode ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
          <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
            <IconImport size={14} /> Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: "none" }}
          />
          <button className="btn-secondary" onClick={handleExport}>
            <IconExport size={14} /> Export
          </button>
          <button className="btn-danger" onClick={handleReset}>
            <IconReset size={14} /> Reset
          </button>
        </div>
      </header>

      {/* ERROR BANNER */}
      {error && (
        <div className="alert alert-error">
          <IconWarning size={16} /> {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* UNSAVED CHANGES BANNER */}
      {hasUnsavedChanges && (
        <div className="alert alert-warning">
          <IconWarning size={16} /> You have unsaved changes
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="options-main">
        
        {/* API KEYS */}
        <section className="card">
          <div className="card-header" onClick={() => toggleSection("apiKeys")}>
            <div className="card-title">
              <IconKey size={18} />
              <span>API Keys</span>
            </div>
            <IconChevron size={18} collapsed={collapsed.apiKeys} />
          </div>
          {!collapsed.apiKeys && (
            <div className="card-content">
              <ApiKeyField
                label="OpenAI API Key"
                value={settings.openaiApiKey}
                onChange={(v) => updateSetting("openaiApiKey", v)}
                placeholder="sk-..."
                show={showKeys.openai}
                onToggleShow={() => setShowKeys(p => ({ ...p, openai: !p.openai }))}
                status={apiStatus.openai}
                onTest={() => testApiKey("openai")}
                help="Used for GPT models. Get yours at platform.openai.com"
              />
              <ApiKeyField
                label="Groq API Key"
                value={settings.groqApiKey}
                onChange={(v) => updateSetting("groqApiKey", v)}
                placeholder="gsk_..."
                show={showKeys.groq}
                onToggleShow={() => setShowKeys(p => ({ ...p, groq: !p.groq }))}
                status={apiStatus.groq}
                onTest={() => testApiKey("groq")}
                help="Used for fast inference. Get yours at console.groq.com"
              />
              <ApiKeyField
                label="Resend API Key"
                value={settings.resendApiKey}
                onChange={(v) => updateSetting("resendApiKey", v)}
                placeholder="re_..."
                show={showKeys.resend}
                onToggleShow={() => setShowKeys(p => ({ ...p, resend: !p.resend }))}
                status={apiStatus.resend}
                onTest={() => testApiKey("resend")}
                help="Used for lead alert emails. Get yours at resend.com"
              />
            </div>
          )}
        </section>

        {/* LEAD ALERTS */}
        <section className="card">
          <div className="card-header" onClick={() => toggleSection("leadAlerts")}>
            <div className="card-title">
              <IconEmail size={18} />
              <span>Lead Alerts</span>
            </div>
            <IconChevron size={18} collapsed={collapsed.leadAlerts} />
          </div>
          {!collapsed.leadAlerts && (
            <div className="card-content">
              <div className="form-group">
                <label>Notification Email</label>
                <input
                  type="email"
                  value={settings.targetEmail}
                  onChange={(e) => updateSetting("targetEmail", e.target.value)}
                  placeholder="your@email.com"
                />
                <span className="help-text">Receive alerts when hot leads are detected</span>
              </div>
            </div>
          )}
        </section>

        {/* WORKING HOURS */}
        <section className="card">
          <div className="card-header" onClick={() => toggleSection("workingHours")}>
            <div className="card-title">
              <IconClock size={18} />
              <span>Working Hours</span>
            </div>
            <IconChevron size={18} collapsed={collapsed.workingHours} />
          </div>
          {!collapsed.workingHours && (
            <div className="card-content">
              <div className="form-row">
                <div className="form-group">
                  <label>Start Hour</label>
                  <select
                    value={settings.startHour}
                    onChange={(e) => updateSetting("startHour", Number(e.target.value))}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{formatHour(i)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>End Hour</label>
                  <select
                    value={settings.endHour}
                    onChange={(e) => updateSetting("endHour", Number(e.target.value))}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{formatHour(i)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="preview-box">
                <IconInfo size={14} />
                <span>Bot will only run between <strong>{formatHour(settings.startHour)}</strong> and <strong>{formatHour(settings.endHour)}</strong></span>
              </div>
              <div className="preset-buttons">
                <button onClick={() => { updateSetting("startHour", 9); updateSetting("endHour", 17); }}>Business (9-5)</button>
                <button onClick={() => { updateSetting("startHour", 8); updateSetting("endHour", 20); }}>Extended (8-8)</button>
                <button onClick={() => { updateSetting("startHour", 0); updateSetting("endHour", 23); }}>24/7</button>
              </div>
            </div>
          )}
        </section>

        {/* TIMING & DELAYS */}
        <section className="card">
          <div className="card-header" onClick={() => toggleSection("timing")}>
            <div className="card-title">
              <IconTimer size={18} />
              <span>Timing & Delays</span>
            </div>
            <IconChevron size={18} collapsed={collapsed.timing} />
          </div>
          {!collapsed.timing && (
            <div className="card-content">
              <div className="form-group">
                <label>Chat Delay (between messages)</label>
                <div className="range-inputs">
                  <div className="range-input">
                    <span>Min</span>
                    <input
                      type="number"
                      value={settings.chatMinDelay / 1000}
                      onChange={(e) => updateSetting("chatMinDelay", Number(e.target.value) * 1000)}
                      min={0.25}
                      max={60}
                      step={0.25}
                    />
                    <span>sec</span>
                  </div>
                  <div className="range-input">
                    <span>Max</span>
                    <input
                      type="number"
                      value={settings.chatMaxDelay / 1000}
                      onChange={(e) => updateSetting("chatMaxDelay", Number(e.target.value) * 1000)}
                      min={0.25}
                      max={120}
                      step={0.25}
                    />
                    <span>sec</span>
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>Loop Delay (between conversation batches)</label>
                <div className="range-inputs">
                  <div className="range-input">
                    <span>Min</span>
                    <input
                      type="number"
                      value={settings.loopMinDelay / 1000}
                      onChange={(e) => updateSetting("loopMinDelay", Number(e.target.value) * 1000)}
                      min={1}
                      max={600}
                      step={1}
                    />
                    <span>sec</span>
                  </div>
                  <div className="range-input">
                    <span>Max</span>
                    <input
                      type="number"
                      value={settings.loopMaxDelay / 1000}
                      onChange={(e) => updateSetting("loopMaxDelay", Number(e.target.value) * 1000)}
                      min={1}
                      max={600}
                      step={1}
                    />
                    <span>sec</span>
                  </div>
                </div>
              </div>
              <div className="preset-buttons">
                <button onClick={() => {
                  updateSetting("chatMinDelay", 1000);
                  updateSetting("chatMaxDelay", 2000);
                  updateSetting("loopMinDelay", 5000);
                  updateSetting("loopMaxDelay", 10000);
                }}>Fast</button>
                <button onClick={() => {
                  updateSetting("chatMinDelay", 2000);
                  updateSetting("chatMaxDelay", 5000);
                  updateSetting("loopMinDelay", 10000);
                  updateSetting("loopMaxDelay", 30000);
                }}>Normal</button>
                <button onClick={() => {
                  updateSetting("chatMinDelay", 3000);
                  updateSetting("chatMaxDelay", 8000);
                  updateSetting("loopMinDelay", 30000);
                  updateSetting("loopMaxDelay", 60000);
                }}>Human-like</button>
              </div>
            </div>
          )}
        </section>

        {/* AI PROMPTS */}
        <section className="card">
          <div className="card-header" onClick={() => toggleSection("prompts")}>
            <div className="card-title">
              <IconBot size={18} />
              <span>AI Prompts</span>
            </div>
            <IconChevron size={18} collapsed={collapsed.prompts} />
          </div>
          {!collapsed.prompts && (
            <div className="card-content">
              <div className="form-group">
                <div className="label-row">
                  <label>Reply Prompt</label>
                  <span className="char-count">{settings.replyPrompt.length} characters</span>
                </div>
                <textarea
                  value={settings.replyPrompt}
                  onChange={(e) => updateSetting("replyPrompt", e.target.value)}
                  rows={6}
                  placeholder="Enter your reply prompt..."
                />
                <div className="variable-chips">
                  <span className="chip-label">Variables:</span>
                  <button className="chip" onClick={() => updateSetting("replyPrompt", settings.replyPrompt + "{user_name}")}>
                    {"{user_name}"}
                  </button>
                  <button className="chip" onClick={() => updateSetting("replyPrompt", settings.replyPrompt + "{extracted_text}")}>
                    {"{extracted_text}"}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <div className="label-row">
                  <label>Lead Detection Prompt</label>
                  <span className="char-count">{settings.leadPrompt.length} characters</span>
                </div>
                <textarea
                  value={settings.leadPrompt}
                  onChange={(e) => updateSetting("leadPrompt", e.target.value)}
                  rows={3}
                  placeholder="Enter your lead detection prompt..."
                />
              </div>
              <div className="preset-buttons">
                <button onClick={() => updateSetting("replyPrompt", "You are {user_name}'s professional assistant. Reply briefly and helpfully to: {extracted_text}")}>
                  Professional
                </button>
                <button onClick={() => updateSetting("replyPrompt", "You are {user_name}. Reply casually and friendly to: {extracted_text}")}>
                  Casual
                </button>
                <button onClick={() => updateSetting("replyPrompt", "You are {user_name}, a sales professional. Reply with interest and ask qualifying questions to: {extracted_text}")}>
                  Sales
                </button>
              </div>
            </div>
          )}
        </section>

        {/* STATISTICS */}
        <section className="card">
          <div className="card-header" onClick={() => toggleSection("statistics")}>
            <div className="card-title">
              <IconChart size={18} />
              <span>Statistics</span>
            </div>
            <IconChevron size={18} collapsed={collapsed.statistics} />
          </div>
          {!collapsed.statistics && (
            <div className="card-content">
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-value">{stats.conversationCount}</span>
                  <span className="stat-label">Conversations</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{stats.totalMessages}</span>
                  <span className="stat-label">Messages</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{stats.lastSession ? new Date(stats.lastSession).toLocaleDateString() : "Never"}</span>
                  <span className="stat-label">Last Session</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* KEYBOARD SHORTCUTS */}
        <section className="card shortcuts-card">
          <div className="card-content">
            <h3>Keyboard Shortcuts</h3>
            <div className="shortcuts-grid">
              <div className="shortcut">
                <kbd>Ctrl</kbd> + <kbd>S</kbd>
                <span>Save settings</span>
              </div>
              <div className="shortcut">
                <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd>
                <span>Reset to defaults</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="options-footer">
        <div className="footer-left">
          {hasUnsavedChanges && <span className="unsaved-dot">●</span>}
          <span>{hasUnsavedChanges ? "Unsaved changes" : "All changes saved"}</span>
        </div>
        <div className="footer-actions">
          <button className="btn-secondary" onClick={handleCancel} disabled={!hasUnsavedChanges}>
            Cancel
          </button>
          <button
            className={`btn-primary ${saveState === "saved" ? "btn-success" : ""}`}
            onClick={handleSave}
            disabled={saveState === "saving" || !hasUnsavedChanges}
          >
            {saveState === "saving" ? "Saving..." : saveState === "saved" ? "✓ Saved" : "Save Settings"}
          </button>
        </div>
      </footer>
    </div>
  );
};

// --- COMPONENT: API Key Field ---
function ApiKeyField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  show: boolean;
  onToggleShow: () => void;
  status: ApiTestStatus;
  onTest: () => void;
  help: string;
}) {
  return (
    <div className="form-group api-key-group">
      <label>{props.label}</label>
      <div className="api-key-row">
        <div className="input-with-icon">
          <input
            type={props.show ? "text" : "password"}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            placeholder={props.placeholder}
          />
          <button className="btn-icon-sm" onClick={props.onToggleShow} type="button">
            {props.show ? <IconEyeOff size={16} /> : <IconEye size={16} />}
          </button>
        </div>
        <button
          className={`btn-test ${props.status}`}
          onClick={props.onTest}
          disabled={!props.value || props.status === "testing"}
        >
          {props.status === "testing" ? "Testing..." : "Test"}
        </button>
        <StatusIndicator status={props.status} />
      </div>
      <span className="help-text">{props.help}</span>
    </div>
  );
}

// --- COMPONENT: Status Indicator ---
function StatusIndicator({ status }: { status: ApiTestStatus }) {
  if (status === "idle") return <span className="status-dot idle">○</span>;
  if (status === "testing") return <span className="status-dot testing">◐</span>;
  if (status === "success") return <span className="status-dot success">●</span>;
  return <span className="status-dot error">●</span>;
}

// --- ICONS ---
function IconSettings({ size = 24, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
    </svg>
  );
}

function IconKey({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
    </svg>
  );
}

function IconEmail({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
    </svg>
  );
}

function IconClock({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
    </svg>
  );
}

function IconTimer({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
    </svg>
  );
}

function IconBot({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S9.83 13 9 13s-1.5-.67-1.5-1.5zM16 17H8v-2h8v2zm-1-4c-.83 0-1.5-.67-1.5-1.5S14.17 10 15 10s1.5.67 1.5 1.5S15.83 13 15 13z"/>
    </svg>
  );
}

function IconChart({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M13 3a2 2 0 0 1 1.995 1.85L15 5v16H9V5a2 2 0 0 1 1.85-1.995L11 3zm7 5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3V8zM7 11v10H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z"/>
    </svg>
  );
}

function IconChevron({ size = 18, collapsed = false }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="currentColor"
      style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
    >
      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
    </svg>
  );
}

function IconEye({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
    </svg>
  );
}

function IconEyeOff({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
    </svg>
  );
}

function IconSun({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/>
    </svg>
  );
}

function IconMoon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z"/>
    </svg>
  );
}

function IconImport({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
    </svg>
  );
}

function IconExport({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/>
    </svg>
  );
}

function IconReset({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
    </svg>
  );
}

function IconWarning({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
    </svg>
  );
}

function IconInfo({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
    </svg>
  );
}

const root = createRoot(document.getElementById("options-root")!);
root.render(<Options />);