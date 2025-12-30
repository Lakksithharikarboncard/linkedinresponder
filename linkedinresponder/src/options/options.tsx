import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./options.css";

const Options = () => {
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [resendApiKey, setResendApiKey] = useState(""); // ✅ ADDED
  const [replyPrompt, setReplyPrompt] = useState("");
  const [leadPrompt, setLeadPrompt] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [chatMinDelay, setChatMinDelay] = useState(2000);
  const [chatMaxDelay, setChatMaxDelay] = useState(5000);
  const [loopMinDelay, setLoopMinDelay] = useState(10000);
  const [loopMaxDelay, setLoopMaxDelay] = useState(30000);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(
      [
        "openaiApiKey",
        "groqApiKey",
        "resendApiKey", // ✅ ADDED
        "replyPrompt",
        "leadPrompt",
        "targetEmail",
        "chatMinDelay",
        "chatMaxDelay",
        "loopMinDelay",
        "loopMaxDelay",
      ],
      (data) => {
        setOpenaiApiKey(data.openaiApiKey || "");
        setGroqApiKey(data.groqApiKey || "");
        setResendApiKey(data.resendApiKey || ""); // ✅ ADDED
        setReplyPrompt(
          data.replyPrompt ||
            "You are {user_name}'s assistant. Reply to this lead based on context:\n{extracted_text}\nReply briefly and professionally."
        );
        setLeadPrompt(
          data.leadPrompt ||
            "Does this conversation indicate strong buying intent or interest? Reply YES or NO."
        );
        setTargetEmail(data.targetEmail || "");
        setChatMinDelay(data.chatMinDelay || 2000);
        setChatMaxDelay(data.chatMaxDelay || 5000);
        setLoopMinDelay(data.loopMinDelay || 10000);
        setLoopMaxDelay(data.loopMaxDelay || 30000);
      }
    );
  }, []);

  const handleSave = () => {
    chrome.storage.local.set(
      {
        openaiApiKey,
        groqApiKey,
        resendApiKey, // ✅ ADDED
        replyPrompt,
        leadPrompt,
        targetEmail,
        chatMinDelay,
        chatMaxDelay,
        loopMinDelay,
        loopMaxDelay,
      },
      () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #fbf2c4, #e5c185)", padding: "40px 20px" }}>
      <div style={{ maxWidth: "700px", margin: "0 auto" }}>
        {/* HEADER */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                background: "linear-gradient(135deg, #c7522a, #008585)",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 18C15.3137 18 18 15.3137 18 12C18 8.68629 15.3137 6 12 6C8.68629 6 6 8.68629 6 12C6 15.3137 8.68629 18 12 18Z" stroke="white" strokeWidth="1.5"/>
                <path d="M18 12H12M9 6.80273L12 12M12 12L9 17.1973" stroke="white" strokeWidth="1.5"/>
                <path d="M12 19C15.866 19 19 15.866 19 12C19 8.13401 15.866 5 12 5C8.13401 5 5 8.13401 5 12C5 15.866 8.13401 19 12 19Z" stroke="white" strokeWidth="1.5" strokeDasharray="1 3"/>
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="white" strokeWidth="1.5"/>
                <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="white" strokeWidth="1.5"/>
              </svg>
            </div>
          </div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#173a35", margin: "0 0 8px" }}>
            LinkedIn Autoresponder Settings
          </h1>
          <p style={{ fontSize: "14px", color: "#6c757d", margin: 0 }}>Configure your automation bot</p>
        </div>

        {/* API KEYS SECTION */}
        <div style={{ background: "white", borderRadius: "12px", padding: "24px", marginBottom: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 13V8C21 6.89543 20.1046 6 19 6H5C3.89543 6 3 6.89543 3 8V14C3 15.1046 3.89543 16 5 16H12" stroke="#173a35" strokeWidth="1.5"/>
              <path fillRule="evenodd" clipRule="evenodd" d="M20.8789 16.9174C21.3727 17.2211 21.3423 17.9604 20.8337 18.0181L18.2671 18.309L17.1159 20.6213C16.8878 21.0795 16.1827 20.8552 16.0661 20.2873L14.8108 14.1713C14.7123 13.6913 15.1437 13.3892 15.561 13.646L20.8789 16.9174Z" stroke="#173a35" strokeWidth="1.5"/>
              <path d="M12 11.01L12.01 10.9989" stroke="#173a35" strokeWidth="1.5"/>
              <path d="M16 11.01L16.01 10.9989" stroke="#173a35" strokeWidth="1.5"/>
              <path d="M8 11.01L8.01 10.9989" stroke="#173a35" strokeWidth="1.5"/>
            </svg>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#173a35", margin: 0 }}>API Keys</h2>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#173a35", marginBottom: "6px" }}>
              OpenAI API Key
            </label>
            <input
              type="password"
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              placeholder="sk-..."
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #dee2e6",
                borderRadius: "8px",
                fontSize: "13px",
                fontFamily: "monospace",
              }}
            />
            <p style={{ fontSize: "11px", color: "#6c757d", margin: "4px 0 0" }}>
              Used for GPT-4o models and decision logic
            </p>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#173a35", marginBottom: "6px" }}>
              Groq API Key
            </label>
            <input
              type="password"
              value={groqApiKey}
              onChange={(e) => setGroqApiKey(e.target.value)}
              placeholder="gsk_..."
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #dee2e6",
                borderRadius: "8px",
                fontSize: "13px",
                fontFamily: "monospace",
              }}
            />
            <p style={{ fontSize: "11px", color: "#6c757d", margin: "4px 0 0" }}>
              Used for Llama, GPT-OSS, Kimi K2, and other Groq models (faster + higher limits)
            </p>
          </div>

          {/* ✅ ADDED: RESEND API KEY */}
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#173a35", marginBottom: "6px" }}>
              Resend API Key
            </label>
            <input
              type="password"
              value={resendApiKey}
              onChange={(e) => setResendApiKey(e.target.value)}
              placeholder="re_..."
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #dee2e6",
                borderRadius: "8px",
                fontSize: "13px",
                fontFamily: "monospace",
              }}
            />
            <p style={{ fontSize: "11px", color: "#6c757d", margin: "4px 0 0" }}>
              Used for sending lead alert emails (get your key at <a href="https://resend.com/api-keys" target="_blank" style={{ color: "#008585" }}>resend.com</a>)
            </p>
          </div>
        </div>

        {/* LEAD ALERTS SECTION */}
        <div style={{ background: "white", borderRadius: "12px", padding: "24px", marginBottom: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 9L9.5 12L14 9" stroke="#173a35" strokeWidth="1.5"/>
              <path d="M17 19H3C1.89543 19 1 18.1046 1 17V7C1 5.89543 1.89543 5 3 5H16C17.1046 5 18 5.89543 18 7V9" stroke="#173a35" strokeWidth="1.5"/>
              <path d="M17 14H23M23 14L20 11M23 14L20 17" stroke="#173a35" strokeWidth="1.5"/>
            </svg>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#173a35", margin: 0 }}>Lead Alerts</h2>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#173a35", marginBottom: "6px" }}>
              Target Email
            </label>
            <input
              type="email"
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #dee2e6",
                borderRadius: "8px",
                fontSize: "13px",
              }}
            />
            <p style={{ fontSize: "11px", color: "#6c757d", margin: "4px 0 0" }}>
              Receive instant email alerts when bot detects a hot lead
            </p>
          </div>
        </div>

        {/* TIMING & DELAYS SECTION */}
        <div style={{ background: "white", borderRadius: "12px", padding: "24px", marginBottom: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 1.25C6.06294 1.25 1.25 6.06294 1.25 12C1.25 17.9371 6.06294 22.75 12 22.75C17.9371 22.75 22.75 17.9371 22.75 12C22.75 6.06294 17.9371 1.25 12 1.25ZM12.75 6C12.75 5.58579 12.4142 5.25 12 5.25C11.5858 5.25 11.25 5.58579 11.25 6L11.25 12C11.25 12.4142 11.5858 12.75 12 12.75H18C18.4142 12.75 18.75 12.4142 18.75 12C18.75 11.5858 18.4142 11.25 18 11.25H12.75L12.75 6Z" fill="#173a35"/>
            </svg>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#173a35", margin: 0 }}>Timing & Delays</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#173a35", marginBottom: "6px" }}>
                Chat Min Delay (seconds)
              </label>
              <input
                type="number"
                value={chatMinDelay / 1000}
                onChange={(e) => setChatMinDelay(Number(e.target.value) * 1000)}
                min={0.5}
                max={10}
                step={0.1}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #dee2e6",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#173a35", marginBottom: "6px" }}>
                Chat Max Delay (seconds)
              </label>
              <input
                type="number"
                value={chatMaxDelay / 1000}
                onChange={(e) => setChatMaxDelay(Number(e.target.value) * 1000)}
                min={1}
                max={20}
                step={0.1}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #dee2e6",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#173a35", marginBottom: "6px" }}>
                Loop Min Delay (seconds)
              </label>
              <input
                type="number"
                value={loopMinDelay / 1000}
                onChange={(e) => setLoopMinDelay(Number(e.target.value) * 1000)}
                min={1}
                max={60}
                step={1}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #dee2e6",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#173a35", marginBottom: "6px" }}>
                Loop Max Delay (seconds)
              </label>
              <input
                type="number"
                value={loopMaxDelay / 1000}
                onChange={(e) => setLoopMaxDelay(Number(e.target.value) * 1000)}
                min={5}
                max={300}
                step={5}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #dee2e6",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              />
            </div>
          </div>
        </div>

        {/* AI PROMPTS SECTION */}
        <div style={{ background: "white", borderRadius: "12px", padding: "24px", marginBottom: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 1.25C6.06294 1.25 1.25 6.06294 1.25 12C1.25 13.8563 1.72113 15.6046 2.55076 17.1298L1.76267 21.3627C1.71742 21.6058 1.79485 21.8555 1.96967 22.0303C2.14448 22.2051 2.39422 22.2826 2.63727 22.2373L6.87016 21.4493C8.39536 22.2788 10.1437 22.75 12 22.75C17.937 22.75 22.75 17.937 22.75 12C22.75 6.06293 17.937 1.25 12 1.25ZM17 10.75C16.3097 10.75 15.75 11.3097 15.75 12C15.75 12.6903 16.3097 13.25 17 13.25C17.6903 13.25 18.25 12.6903 18.25 12C18.25 11.3097 17.6903 10.75 17 10.75ZM10.75 12C10.75 11.3097 11.3097 10.75 12 10.75C12.6903 10.75 13.25 11.3097 13.25 12C13.25 12.6903 12.6903 13.25 12 13.25C11.3097 13.25 10.75 12.6903 10.75 12ZM7 10.75C6.30961 10.75 5.75 11.3097 5.75 12C5.75 12.6903 6.30961 13.25 7 13.25C7.69039 13.25 8.25 12.6903 8.25 12C8.25 11.3097 7.69039 10.75 7 10.75Z" fill="#173a35"/>
            </svg>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#173a35", margin: 0 }}>AI Response Prompt</h2>
          </div>

          <textarea
            value={replyPrompt}
            onChange={(e) => setReplyPrompt(e.target.value)}
            rows={6}
            style={{
              width: "100%",
              padding: "12px",
              border: "1px solid #dee2e6",
              borderRadius: "8px",
              fontSize: "13px",
              fontFamily: "monospace",
              resize: "vertical",
            }}
          />
          <p style={{ fontSize: "11px", color: "#6c757d", margin: "8px 0 0" }}>
            Use <code>{"{extracted_text}"}</code> for conversation history and <code>{"{user_name}"}</code> for lead name
          </p>
        </div>

        <div style={{ background: "white", borderRadius: "12px", padding: "24px", marginBottom: "32px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "#173a35", marginBottom: "12px" }}>Lead Detection Prompt</h2>
          <textarea
            value={leadPrompt}
            onChange={(e) => setLeadPrompt(e.target.value)}
            rows={4}
            style={{
              width: "100%",
              padding: "12px",
              border: "1px solid #dee2e6",
              borderRadius: "8px",
              fontSize: "13px",
              fontFamily: "monospace",
              resize: "vertical",
            }}
          />
          <p style={{ fontSize: "11px", color: "#6c757d", margin: "8px 0 0" }}>
            AI uses this to decide if conversation indicates buying intent
          </p>
        </div>

        {/* SAVE BUTTON */}
        <button
          onClick={handleSave}
          style={{
            width: "100%",
            padding: "14px",
            background: saved ? "#74a892" : "linear-gradient(135deg, #c7522a, #008585)",
            color: "white",
            border: "none",
            borderRadius: "10px",
            fontSize: "15px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {saved ? "✓ Saved Successfully" : "Save Settings"}
        </button>

        <p style={{ textAlign: "center", fontSize: "12px", color: "#6c757d", marginTop: "16px" }}>
          v2.4.0 • LinkedIn Autoresponder
        </p>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("options-root")!);
root.render(<Options />);
