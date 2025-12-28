import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./options.css";

function Options() {
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [prompt, setPrompt] = useState(
    "Reply briefly and professionally to this LinkedIn message:"
  );
  const [chatMinSec, setChatMinSec] = useState(1);
  const [chatMaxSec, setChatMaxSec] = useState(2.5);
  const [loopMinSec, setLoopMinSec] = useState(3);
  const [loopMaxSec, setLoopMaxSec] = useState(6);
  const [status, setStatus] = useState<null | "success" | "error">(null);
  const [targetEmail, setTargetEmail] = useState("");
  const [leadPrompt, setLeadPrompt] = useState(
    "Lead shares contact details (email/phone/WhatsApp), asks about pricing or demo, or explicitly wants to schedule a call"
  );
  const [resendApiKey, setResendApiKey] = useState("");
  const [showResendKey, setShowResendKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    chrome.storage.local.get(
      [
        "openaiApiKey",
        "replyPrompt",
        "chatMinDelay",
        "chatMaxDelay",
        "loopMinDelay",
        "loopMaxDelay",
        "targetEmail",
        "leadPrompt",
        "resendApiKey",
      ],
      (res) => {
        if (res.openaiApiKey) setApiKey(res.openaiApiKey);
        if (res.replyPrompt) setPrompt(res.replyPrompt);
        if (typeof res.chatMinDelay === "number") setChatMinSec(res.chatMinDelay / 1000);
        if (typeof res.chatMaxDelay === "number") setChatMaxSec(res.chatMaxDelay / 1000);
        if (typeof res.loopMinDelay === "number") setLoopMinSec(res.loopMinDelay / 1000);
        if (typeof res.loopMaxDelay === "number") setLoopMaxSec(res.loopMaxDelay / 1000);
        if (res.targetEmail) setTargetEmail(res.targetEmail);
        if (res.leadPrompt) setLeadPrompt(res.leadPrompt);
        if (res.resendApiKey) setResendApiKey(res.resendApiKey);
        setIsLoading(false);
      }
    );
  }, []);

  const handleSave = () => {
    const validApi = apiKey.startsWith("sk-");
    const validChat = chatMinSec >= 0 && chatMaxSec >= chatMinSec;
    const validLoop = loopMinSec >= 0 && loopMaxSec >= loopMinSec;

    if (!validApi || !validChat || !validLoop) {
      setStatus("error");
      setTimeout(() => setStatus(null), 3000);
      return;
    }

    chrome.storage.local.set(
      {
        openaiApiKey: apiKey,
        replyPrompt: prompt,
        targetEmail: targetEmail,
        leadPrompt: leadPrompt,
        resendApiKey: resendApiKey,
        chatMinDelay: chatMinSec * 1000,
        chatMaxDelay: chatMaxSec * 1000,
        loopMinDelay: loopMinSec * 1000,
        loopMaxDelay: loopMaxSec * 1000,
      },
      () => {
        setStatus("success");
        setTimeout(() => setStatus(null), 3000);
      }
    );
  };

  const resetToDefaults = () => {
    setPrompt("Reply briefly and professionally to this LinkedIn message:");
    setLeadPrompt("Lead shares contact details (email/phone/WhatsApp), asks about pricing or demo, or explicitly wants to schedule a call");
    setChatMinSec(1);
    setChatMaxSec(2.5);
    setLoopMinSec(3);
    setLoopMaxSec(6);
    setTargetEmail("");
    setResendApiKey("");
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="options-container">
      <div className="options-header">
        <div className="header-content">
          <div className="icon-wrapper">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h1>LinkedIn AI Responder</h1>
          <p className="subtitle">Configure your automated messaging assistant</p>
        </div>
      </div>

      {status === "success" && (
        <div className="alert alert-success">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Settings saved successfully!
        </div>
      )}

      {status === "error" && (
        <div className="alert alert-error">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          Please check your API key and delay values!
        </div>
      )}

      <div className="settings-grid">
        {/* API Configuration */}
        <div className="settings-card">
          <div className="card-header">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <h2>API Configuration</h2>
          </div>
          
          <div className="form-group">
            <label htmlFor="openai-key">
              OpenAI API Key <span className="required">*</span>
            </label>
            <div className="input-with-button">
              <input
                id="openai-key"
                type={showApiKey ? "text" : "password"}
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value.trim())}
                className="input-field"
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? "Hide" : "Show"}
              >
                {showApiKey ? "🙈" : "👁️"}
              </button>
            </div>
            <p className="input-hint">
              Get your key from{" "}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
                OpenAI Dashboard
              </a>
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="resend-key">
              Resend API Key <span className="optional">(Optional)</span>
            </label>
            <div className="input-with-button">
              <input
                id="resend-key"
                type={showResendKey ? "text" : "password"}
                placeholder="re_..."
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value.trim())}
                className="input-field"
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowResendKey(!showResendKey)}
                title={showResendKey ? "Hide" : "Show"}
              >
                {showResendKey ? "🙈" : "👁️"}
              </button>
            </div>
            <p className="input-hint">
              For email notifications. Get from{" "}
              <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer">
                Resend
              </a>
            </p>
          </div>
        </div>

        {/* AI Response Configuration */}
        <div className="settings-card">
          <div className="card-header">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <h2>AI Response Prompt</h2>
          </div>

          <div className="form-group">
            <label htmlFor="reply-prompt">Reply Prompt Template</label>
            <textarea
              id="reply-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              className="textarea-field"
              placeholder="Enter your custom prompt for AI responses..."
            />
            <p className="input-hint">
              Use <code>{`{user_name}`}</code> and <code>{`{extracted_text}`}</code> as placeholders
            </p>
          </div>
        </div>

        {/* Lead Notifications */}
        <div className="settings-card">
          <div className="card-header">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
            <h2>Lead Notifications</h2>
          </div>

          <div className="form-group">
            <label htmlFor="target-email">Notification Email</label>
            <input
              id="target-email"
              type="email"
              placeholder="your-email@example.com"
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value.trim())}
              className="input-field"
            />
            <p className="input-hint">Get notified when leads share contact info</p>
          </div>

          <div className="form-group">
            <label htmlFor="lead-criteria">Lead Qualification Criteria</label>
            <textarea
              id="lead-criteria"
              value={leadPrompt}
              onChange={(e) => setLeadPrompt(e.target.value)}
              rows={3}
              className="textarea-field"
              placeholder="What makes a lead qualified?"
            />
            <p className="input-hint">AI checks if conversation meets this criteria</p>
          </div>
        </div>

        {/* Timing Configuration */}
        <div className="settings-card full-width">
          <div className="card-header">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <h2>Timing Configuration</h2>
          </div>

          <div className="timing-grid">
            <div className="timing-section">
              <h3>Per-Chat Delay (seconds)</h3>
              <div className="delay-inputs">
                <div className="form-group">
                  <label htmlFor="chat-min">Minimum</label>
                  <input
                    id="chat-min"
                    type="number"
                    min={0}
                    step={0.1}
                    value={chatMinSec}
                    onChange={(e) => setChatMinSec(Number(e.target.value))}
                    className="input-field number-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="chat-max">Maximum</label>
                  <input
                    id="chat-max"
                    type="number"
                    min={chatMinSec}
                    step={0.1}
                    value={chatMaxSec}
                    onChange={(e) => setChatMaxSec(Number(e.target.value))}
                    className="input-field number-input"
                  />
                </div>
              </div>
              <p className="input-hint">Delay between processing individual chats</p>
            </div>

            <div className="timing-section">
              <h3>Between-Loops Delay (seconds)</h3>
              <div className="delay-inputs">
                <div className="form-group">
                  <label htmlFor="loop-min">Minimum</label>
                  <input
                    id="loop-min"
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={loopMinSec}
                    onChange={(e) => setLoopMinSec(Number(e.target.value))}
                    className="input-field number-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="loop-max">Maximum</label>
                  <input
                    id="loop-max"
                    type="number"
                    min={loopMinSec}
                    step={0.1}
                    value={loopMaxSec}
                    onChange={(e) => setLoopMaxSec(Number(e.target.value))}
                    className="input-field number-input"
                  />
                </div>
              </div>
              <p className="input-hint">Delay before starting next batch of chats</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <button className="btn btn-primary" onClick={handleSave}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          Save All Settings
        </button>
        <button className="btn btn-secondary" onClick={resetToDefaults}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          Reset to Defaults
        </button>
      </div>

      <div className="footer">
        <p>
          Need help? Visit our{" "}
          <a href="https://www.airesponder.xyz/" target="_blank" rel="noopener noreferrer">
            documentation
          </a>
        </p>
        <p className="version">LinkedIn AI Responder v2.1.3</p>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("options-root")!);
root.render(<Options />);
