// linkedinresponder/src/options/options.tsx
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./options.css";
import { DEFAULT_SETTINGS, getBotSettings, setBotSettings, BotSettings, AIProvider } from "../shared/settings";

type SaveState = "idle" | "saving" | "saved" | "error";
type ApiTestStatus = "idle" | "testing" | "success" | "error";

interface ApiKeyStatus { openai: ApiTestStatus; groq: ApiTestStatus; }
interface ApiKeyMessage { openai: string; groq: string; }

const Options = () => {
  const [settings, setSettings] = useState<BotSettings>(DEFAULT_SETTINGS);
  const [originalSettings, setOriginalSettings] = useState<BotSettings>(DEFAULT_SETTINGS);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [apiStatus, setApiStatus] = useState<ApiKeyStatus>({ openai: "idle", groq: "idle" });
  const [apiMessage, setApiMessage] = useState<ApiKeyMessage>({ openai: "", groq: "" });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await getBotSettings();
        setSettings(s);
        setOriginalSettings(s);
      } catch {
        setError("Failed to load settings");
      }
    })();
    chrome.storage.local.get(["darkMode"], (data) => {
      if (data.darkMode !== undefined) setDarkMode(data.darkMode);
    });
  }, []);

  useEffect(() => {
    setHasUnsavedChanges(JSON.stringify(settings) !== JSON.stringify(originalSettings));
  }, [settings, originalSettings]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    chrome.storage.local.set({ darkMode });
  }, [darkMode]);

  const updateSetting = <K extends keyof BotSettings>(key: K, value: BotSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setError(null);
    setSaveState("saving");

    if (settings.endHour <= settings.startHour) {
      setSaveState("error");
      setError("End hour must be after start hour");
      return;
    }
    if (!settings.openaiApiKey.trim()) {
      setSaveState("error");
      setError("OpenAI API key is required");
      return;
    }
    if (!settings.groqApiKey.trim()) {
      setSaveState("error");
      setError("Groq API key is required");
      return;
    }

    try {
      await setBotSettings(settings);
      setOriginalSettings(settings);
      setSaveState("saved");
      setHasUnsavedChanges(false);
      setTimeout(() => setSaveState("idle"), 1800);
    } catch {
      setSaveState("error");
      setError("Failed to save settings");
    }
  };

  const handleReset = () => {
    if (!confirm("Reset all settings to defaults?\n\nThis cannot be undone.")) return;
    setSettings(DEFAULT_SETTINGS);
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
          setError("Invalid settings file");
        }
      } catch {
        setError("Failed to parse settings file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleExport = () => {
    const data = { settings, exportedAt: new Date().toISOString(), version: "2.7.0" };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `linkedin-autoresponder-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const testApiKey = async (type: "openai" | "groq") => {
    const keyMap = {
      openai: settings.openaiApiKey,
      groq: settings.groqApiKey,
    };

    const key = keyMap[type];

    setApiStatus((s) => ({ ...s, [type]: "testing" }));
    setApiMessage((m) => ({ ...m, [type]: "" }));

    if (!key?.trim()) {
      setApiStatus((s) => ({ ...s, [type]: "error" }));
      setApiMessage((m) => ({ ...m, [type]: "Key is empty" }));
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: "TEST_API_KEY",
        provider: type,
        key,
      });

      if (response?.success) {
        setApiStatus((s) => ({ ...s, [type]: "success" }));
        setApiMessage((m) => ({ ...m, [type]: response.message }));
      } else {
        setApiStatus((s) => ({ ...s, [type]: "error" }));
        setApiMessage((m) => ({ ...m, [type]: response?.message || "Test failed" }));
      }
    } catch (err: any) {
      setApiStatus((s) => ({ ...s, [type]: "error" }));
      setApiMessage((m) => ({ ...m, [type]: err?.message || "Could not reach background script" }));
    }
  };

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? "PM" : "AM";
    const h = hour % 12 || 12;
    return `${h}:00 ${period}`;
  };

  const timeBadge =
    settings.endHour > settings.startHour
      ? `${formatHour(settings.startHour)} – ${formatHour(settings.endHour)}`
      : "Invalid";

  // Helper to set all providers at once
  const setAllProviders = (provider: AIProvider) => {
    updateSetting("replyProvider", provider);
    updateSetting("decisionProvider", provider);
    updateSetting("leadDetectionProvider", provider);
  };

  return (
    <div className="options-shell">
      <header className="options-header">
        <div className="header-left">
          <div className="header-icon">⚙️</div>
          <div>
            <h1>Settings</h1>
            <p>LinkedIn Autoresponder v2.7.0</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn ghost" onClick={() => fileInputRef.current?.click()}>Import</button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />
          <button className="btn ghost" onClick={handleExport}>Export</button>
          <button className="btn ghost" onClick={handleReset}>Reset</button>
          <button className="btn ghost" onClick={() => setDarkMode(!darkMode)}>{darkMode ? "☀️" : "🌙"}</button>
        </div>
      </header>

      {error && <div className="banner error">⚠️ {error}</div>}
      {hasUnsavedChanges && !error && <div className="banner warn">You have unsaved changes</div>}

      <div className="grid">
        {/* API Keys */}
        <section className="card wide">
          <div className="card-header">API Keys</div>
          <div className="card-body two-col">
            <ApiKeyField
              label="OpenAI API Key"
              value={settings.openaiApiKey}
              onChange={(v) => updateSetting("openaiApiKey", v)}
              placeholder="sk-..."
              status={apiStatus.openai}
              message={apiMessage.openai}
              onTest={() => testApiKey("openai")}
            />
            <ApiKeyField
              label="Groq API Key"
              value={settings.groqApiKey}
              onChange={(v) => updateSetting("groqApiKey", v)}
              placeholder="gsk_..."
              status={apiStatus.groq}
              message={apiMessage.groq}
              onTest={() => testApiKey("groq")}
            />
          </div>
        </section>

        {/* AI Provider Selection */}
        <section className="card wide">
          <div className="card-header">AI Provider Selection</div>
          <div className="card-body three-col">
            <ProviderSelect
              label="Reply Generation"
              description="Generates chat responses"
              value={settings.replyProvider}
              onChange={(v) => updateSetting("replyProvider", v)}
            />
            <ProviderSelect
              label="Reply Decision"
              description="Decides if bot should reply"
              value={settings.decisionProvider}
              onChange={(v) => updateSetting("decisionProvider", v)}
            />
            <ProviderSelect
              label="Lead Detection"
              description="Identifies qualified leads"
              value={settings.leadDetectionProvider}
              onChange={(v) => updateSetting("leadDetectionProvider", v)}
            />
          </div>
          <div className="quick-row">
            <button onClick={() => setAllProviders("groq")}>All Groq</button>
            <button onClick={() => setAllProviders("openai")}>All OpenAI</button>
            <button onClick={() => {
              updateSetting("replyProvider", "groq");
              updateSetting("decisionProvider", "groq");
              updateSetting("leadDetectionProvider", "openai");
            }}>Recommended</button>
          </div>
          <p className="muted" style={{ marginTop: "8px" }}>
            💡 <strong>Recommended:</strong> Groq for replies & decisions (fast, cheap), OpenAI for lead detection (accurate).
          </p>
        </section>

        {/* Lead Webhook */}
        <section className="card wide">
          <div className="card-header">Lead Notifications</div>
          <div className="card-body">
            <div className="field-block">
              <label className="field-label">Zapier Webhook URL</label>
              <input
                type="url"
                value={settings.webhookUrl}
                onChange={(e) => updateSetting("webhookUrl", e.target.value)}
                placeholder="https://hooks.zapier.com/hooks/catch/..."
              />
              <span className="muted">When a lead is detected, JSON data will be sent to this webhook.</span>
            </div>
            {settings.webhookUrl && (
              <div className="webhook-preview">
                <p className="field-label" style={{ marginBottom: "8px" }}>Payload Preview:</p>
                <pre className="code-block">{`{
  "leadName": "John Smith",
  "profileUrl": "https://linkedin.com/in/...",
  "company": "Acme Corp",
  "jobTitle": "VP of Sales",
  "headline": "VP of Sales at Acme Corp",
  "conversationHistory": "...",
  "messageCount": 12,
  "detectedAt": "2025-01-03T19:42:00Z"
}`}</pre>
              </div>
            )}
          </div>
        </section>

        {/* Working Hours */}
        <section className="card">
          <div className="card-header">
            <span>Working Hours</span>
            <span className={`pill ${settings.endHour <= settings.startHour ? "pill-warn" : ""}`}>{timeBadge}</span>
          </div>
          <div className="card-body two-col">
            <div className="field-block">
              <label className="field-label">Start</label>
              <select value={settings.startHour} onChange={(e) => updateSetting("startHour", Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{formatHour(i)}</option>
                ))}
              </select>
            </div>
            <div className="field-block">
              <label className="field-label">End</label>
              <select value={settings.endHour} onChange={(e) => updateSetting("endHour", Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{formatHour(i)}</option>
                ))}
              </select>
            </div>
          </div>
          {settings.endHour <= settings.startHour && (
            <p className="muted text-warn">End time must be later than start time.</p>
          )}
          <div className="quick-row">
            <button onClick={() => { updateSetting("startHour", 9); updateSetting("endHour", 17); }}>Business</button>
            <button onClick={() => { updateSetting("startHour", 8); updateSetting("endHour", 20); }}>Extended</button>
            <button onClick={() => { updateSetting("startHour", 0); updateSetting("endHour", 23); }}>24/7</button>
          </div>
        </section>

        {/* Timing */}
        <section className="card">
          <div className="card-header">Timing & Delays</div>
          <div className="card-body two-col">
            <NumberField label="Chat Min (sec)" value={settings.chatMinDelay / 1000} onChange={(v) => updateSetting("chatMinDelay", v * 1000)} min={0.25} max={60} step={0.25} />
            <NumberField label="Chat Max (sec)" value={settings.chatMaxDelay / 1000} onChange={(v) => updateSetting("chatMaxDelay", v * 1000)} min={0.25} max={120} step={0.25} />
            <NumberField label="Loop Min (sec)" value={settings.loopMinDelay / 1000} onChange={(v) => updateSetting("loopMinDelay", v * 1000)} min={1} max={600} step={1} />
            <NumberField label="Loop Max (sec)" value={settings.loopMaxDelay / 1000} onChange={(v) => updateSetting("loopMaxDelay", v * 1000)} min={1} max={600} step={1} />
          </div>
          <div className="quick-row">
            <button onClick={() => { updateSetting("chatMinDelay", 1000); updateSetting("chatMaxDelay", 2000); updateSetting("loopMinDelay", 5000); updateSetting("loopMaxDelay", 10000); }}>Fast</button>
            <button onClick={() => { updateSetting("chatMinDelay", 2000); updateSetting("chatMaxDelay", 5000); updateSetting("loopMinDelay", 10000); updateSetting("loopMaxDelay", 30000); }}>Normal</button>
            <button onClick={() => { updateSetting("chatMinDelay", 3000); updateSetting("chatMaxDelay", 8000); updateSetting("loopMinDelay", 30000); updateSetting("loopMaxDelay", 60000); }}>Human-like</button>
          </div>
        </section>

        {/* Prompts */}
        <section className="card wide">
          <div className="card-header">AI Prompts</div>
          <div className="card-body two-col">
            <div className="field-block">
              <label className="field-label">Reply Prompt</label>
              <textarea rows={5} value={settings.replyPrompt} onChange={(e) => updateSetting("replyPrompt", e.target.value)} />
              <div className="chip-row">
                <span className="chip-label">Variables:</span>
                <button className="chip" onClick={() => updateSetting("replyPrompt", settings.replyPrompt + "{user_name}")}>{`{user_name}`}</button>
                <button className="chip" onClick={() => updateSetting("replyPrompt", settings.replyPrompt + "{extracted_text}")}>{`{extracted_text}`}</button>
              </div>
            </div>
            <div className="field-block">
              <label className="field-label">Lead Detection Prompt</label>
              <textarea rows={3} value={settings.leadPrompt} onChange={(e) => updateSetting("leadPrompt", e.target.value)} />
            </div>
          </div>
          <div className="quick-row">
            <button onClick={() => updateSetting("replyPrompt", "You are {user_name}'s professional assistant. Reply briefly and helpfully to: {extracted_text}")}>Professional</button>
            <button onClick={() => updateSetting("replyPrompt", "You are {user_name}. Reply casually and friendly to: {extracted_text}")}>Casual</button>
            <button onClick={() => updateSetting("replyPrompt", "You are {user_name}, a sales professional. Reply with interest and ask qualifying questions to: {extracted_text}")}>Sales</button>
          </div>
        </section>
      </div>

      <footer className="options-footer">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {hasUnsavedChanges && <span className="unsaved-dot">●</span>}
          <span>{hasUnsavedChanges ? "Unsaved changes" : "All changes saved"}</span>
        </div>
        <div className="footer-actions">
          <button className="btn ghost" onClick={() => setSettings(originalSettings)} disabled={!hasUnsavedChanges}>Cancel</button>
          <button className={`btn primary ${saveState === "saved" ? "success" : ""}`} onClick={handleSave} disabled={saveState === "saving" || !hasUnsavedChanges}>
            {saveState === "saving" ? "Saving..." : saveState === "saved" ? "✓ Saved" : "Save Settings"}
          </button>
        </div>
      </footer>
    </div>
  );
};

function ApiKeyField(props: { label: string; value: string; onChange: (v: string) => void; placeholder: string; status: ApiTestStatus; message: string; onTest: () => void }) {
  return (
    <div className="field-block">
      <label className="field-label">{props.label}</label>
      <div className="row">
        <input type="password" value={props.value} onChange={(e) => props.onChange(e.target.value)} placeholder={props.placeholder} style={{ flex: 1 }} />
        <button className="btn ghost" onClick={props.onTest} disabled={!props.value || props.status === "testing"} style={{ whiteSpace: "nowrap" }}>
          {props.status === "testing" ? "..." : "Test"}
        </button>
        <StatusDot status={props.status} />
      </div>
      {props.message && <span className={`muted ${props.status === "error" ? "text-warn" : ""}`}>{props.message}</span>}
    </div>
  );
}

function ProviderSelect(props: { label: string; description: string; value: AIProvider; onChange: (v: AIProvider) => void }) {
  return (
    <div className="field-block">
      <label className="field-label">{props.label}</label>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value as AIProvider)}>
        <option value="groq">Groq (Fast)</option>
        <option value="openai">OpenAI (Accurate)</option>
      </select>
      <span className="muted">{props.description}</span>
    </div>
  );
}

function NumberField(props: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number }) {
  return (
    <div className="field-block">
      <label className="field-label">{props.label}</label>
      <input type="number" value={props.value} min={props.min} max={props.max} step={props.step} onChange={(e) => props.onChange(Number(e.target.value))} />
    </div>
  );
}

function StatusDot({ status }: { status: ApiTestStatus }) {
  const color = status === "success" ? "#74a892" : status === "error" ? "#c7522a" : status === "testing" ? "#e5c185" : "#adb5bd";
  return <span className="status-dot" style={{ background: color }} />;
}

const root = createRoot(document.getElementById("options-root")!);
root.render(<Options />);