import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function Options() {
  const [apiKey, setApiKey] = useState("");
  const [prompt, setPrompt] = useState(
    "Reply briefly and professionally to this LinkedIn message:"
  );
  // now these hold seconds
  const [chatMinSec, setChatMinSec] = useState(1);
  const [chatMaxSec, setChatMaxSec] = useState(2.5);
  const [loopMinSec, setLoopMinSec] = useState(3);
  const [loopMaxSec, setLoopMaxSec] = useState(6);
  const [status, setStatus] = useState<null | "success" | "error">(null);

  // Load saved settings on mount
  useEffect(() => {
    chrome.storage.local.get(
      [
        "openaiApiKey",
        "replyPrompt",
        "chatMinDelay",
        "chatMaxDelay",
        "loopMinDelay",
        "loopMaxDelay",
      ],
      (res) => {
        if (res.openaiApiKey) setApiKey(res.openaiApiKey);
        if (res.replyPrompt) setPrompt(res.replyPrompt);
        if (typeof res.chatMinDelay === "number") setChatMinSec(res.chatMinDelay/ 1000);
        if (typeof res.chatMaxDelay === "number") setChatMaxSec(res.chatMaxDelay/ 1000);
        if (typeof res.loopMinDelay === "number") setLoopMinSec(res.loopMinDelay/ 1000);
        if (typeof res.loopMaxDelay === "number") setLoopMaxSec(res.loopMaxDelay/ 1000);
      }
    );
  }, []);

  // Validate & save settings
  const handleSave = () => {
    const validApi = apiKey.startsWith("sk");
    const validChat = chatMinSec >= 0 && chatMaxSec >= chatMinSec;
    const validLoop = loopMinSec >= 0 && loopMaxSec >= loopMinSec;

    if (!validApi || !validChat || !validLoop) {
      setStatus("error");
      return;
    }

    chrome.storage.local.set(
      {
        openaiApiKey: apiKey,
        replyPrompt: prompt,
        chatMinDelay: chatMinSec * 1000,
        chatMaxDelay: chatMaxSec * 1000,
        loopMinDelay: loopMinSec * 1000,
        loopMaxDelay: loopMaxSec * 1000,
      },
      () => {
        setStatus("success");
        setTimeout(() => setStatus(null), 1500);
      }
    );
  };

  return (
    <div className="options-root" style={{ padding: 16, maxWidth: "auto", margin: "20px auto" }}>
      {/* <img src="karbon.png" alt="Logo" className="logo" /> */}
      <h2>LinkedIn AI Responder Settings</h2>

      <label>OpenAI API Key:</label>
      <input
        type="password"
        placeholder="sk-..."
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value.trim())}
      />

      <label>Default Reply Prompt:</label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
      />

      <fieldset style={{ marginBottom: 10 }}>
        <legend>Per-chat Delay (seconds)</legend>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label>Min:</label>
          <input
            type="number"
            min={0}
            step={0.1}
            value={chatMinSec}
            onChange={(e) => setChatMinSec(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <label>Max:</label>
          <input
            type="number"
            min={chatMinSec}
            step={0.1}
            value={chatMaxSec}
            onChange={(e) => setChatMaxSec(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>
      </fieldset>

      <fieldset style={{ marginBottom: 10 }}>
        <legend>Between-loops Delay (seconds)</legend>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label>Min:</label>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={loopMinSec}
            onChange={(e) => setLoopMinSec(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <label>Max:</label>
          <input
            type="number"
            min={loopMinSec}
            step={0.1}
            value={loopMaxSec}
            onChange={(e) => setLoopMaxSec(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>
      </fieldset>

      <button onClick={handleSave} style={{ width: "100%", padding: 8 }}>
        Save Settings
      </button>

      {status === "success" && (
        <div style={{ marginTop: 12, color: "green" }}>✅ Settings saved!</div>
      )}
      {status === "error" && (
        <div style={{ marginTop: 12, color: "red" }}>
          ⚠️ Please check your API key and delay values.
        </div>
      )}

      <p style={{ marginTop: 24, fontSize: 12, color: "#555" }}>
        Get your API key from{" "}
        <a href="https://platform.openai.com/account/api-keys" target="_blank">
          OpenAI Dashboard
        </a>
      </p>
    </div>
  );
}

const root = createRoot(document.getElementById("options-root")!);
root.render(<Options />);
