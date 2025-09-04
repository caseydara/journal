// src/components/Assistant.jsx
import React, { useEffect, useRef, useState } from "react";
import { useVoice, VoiceReadyState } from "@humeai/voice-react";
import { loadEntries, saveEntry } from "../lib/storage";

const EVI_CONFIG_ID =
  process.env.NEXT_PUBLIC_HUME_CONFIG_ID ||
  "e542db5e-a7f9-409f-914f-c2a060d7dc5b";
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

// Mood definitions
const MOODS = [
  "happy","excited","proud","grateful","content","calm","productive",
  "bored","unmotivated","annoyed","fearful","lonely","sad","depressed",
  "shame","guilty","love"
];
const MOOD_EMOJI = {
  happy: "😄", excited: "🤩", proud: "🏆", grateful: "🙏", content: "🙂",
  calm: "😌", productive: "💪", bored: "😐", unmotivated: "😕", annoyed: "😠",
  fearful: "😨", lonely: "😔", sad: "😢", depressed: "😞", shame: "😳",
  guilty: "😖", love: "❤️"
};

// Simple positive/negative mood classifier
const POSITIVE_MOODS = new Set([
  "happy","excited","proud","grateful","content","calm","productive","love"
]);
const NEGATIVE_MOODS = new Set([
  "bored","unmotivated","annoyed","fearful","lonely","sad","depressed","shame","guilty"
]);

export default function Assistant() {
  const {
    connect,
    disconnect,
    readyState,
    messages,
    sendAssistantInput,
  } = useVoice();

  const [selectedMoods, setSelectedMoods] = useState([]);
  const [entries, setEntries] = useState([]);
  const [view, setView] = useState("mood");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState(null);
  const [pendingOpener, setPendingOpener] = useState(null);

  const sessionSourceRef = useRef(null);

  // Load history on mount
  useEffect(() => {
    (async () => {
      const e = await loadEntries();
      setEntries(e || []);
    })();
  }, []);

  // Once connected, send the opener if one is pending
  useEffect(() => {
    if (readyState === VoiceReadyState.OPEN && pendingOpener) {
      sendAssistantInput(pendingOpener);
      setPendingOpener(null);
    }
  }, [readyState, pendingOpener, sendAssistantInput]);

  function toggleMood(m) {
    setSelectedMoods((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  }

  function classifyMoodSet(moods) {
    const positives = moods.filter((m) => POSITIVE_MOODS.has(m)).length;
    const negatives = moods.filter((m) => NEGATIVE_MOODS.has(m)).length;
    if (positives > negatives) return "positive";
    if (negatives > positives) return "negative";
    return "neutral";
  }

  function buildProgressiveOpener(moods, lastEntry) {
    if (!moods.length) return "How are you feeling today?";

    const todayLabel = classifyMoodSet(moods);
    const todayText = moods.join(", ");

    if (!lastEntry || !lastEntry.moods || !lastEntry.moods.length) {
      // No history, just mood-aware opener
      if (todayLabel === "positive") {
        return `I see you’re feeling ${todayText} — that’s wonderful! Tell me more.`;
      }
      if (todayLabel === "negative") {
        return `I see you’re feeling ${todayText}. I’m here to listen, want to share what’s on your mind?`;
      }
      return `I see you’re feeling ${todayText}. How’s your day going?`;
    }

    const lastLabel = classifyMoodSet(lastEntry.moods);
    const lastText = lastEntry.moods.join(", ");

    // Compare last vs today
    if (lastLabel === "positive" && todayLabel === "negative") {
      return `Last time you were feeling ${lastText}, but now you’re feeling ${todayText}. Do you want to talk about what changed?`;
    }
    if (lastLabel === "negative" && todayLabel === "positive") {
      return `Previously you felt ${lastText}, but now you’re feeling ${todayText} — that’s great to hear! What changed?`;
    }
    if (lastLabel === todayLabel) {
      return `You mentioned feeling ${lastText} before, and now ${todayText}. Want to share more about that?`;
    }

    // Fallback
    return `I see you’re feeling ${todayText}. How are things going since last time?`;
  }

  /* ---------- Hume connect / disconnect ---------- */
  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const resp = await fetch(`${API_URL}/hume-token`);
      const j = await resp.json();
      if (!j.accessToken) throw new Error("no token");

      const lastEntry = entries.length ? entries[entries.length - 1] : null;
      const opener = buildProgressiveOpener(selectedMoods, lastEntry);
      setPendingOpener(opener);

      await connect({
        auth: { type: "accessToken", value: j.accessToken },
        configId: EVI_CONFIG_ID,
        sessionSettings: { meta: { moods: selectedMoods } },
      });

      sessionSourceRef.current = "hume";
    } catch (err) {
      console.error("Connect error", err);
      setConnectError(String(err));
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    try { disconnect(); } catch (e) {}
    sessionSourceRef.current = null;
  }

  function isHumeConnected() {
    return readyState === VoiceReadyState.OPEN;
  }

  /* ---------- Save conversation ---------- */
  async function finishAndSave() {
    const msgs = messages
      .filter(
        (m) =>
          m.message &&
          (m.type === "user_message" || m.type === "assistant_message")
      )
      .map((m) => ({ role: m.message.role, text: m.message.content }));

    if (sessionSourceRef.current !== "hume") {
      console.warn("Skipping save: not a Hume session");
      return;
    }

    let summary = "";
    let takeaways = [];
    try {
      const resp = await fetch(`${API_URL}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs }),
      });
      const data = await resp.json();
      summary = data.summary || "";
      takeaways = Array.isArray(data.takeaways) ? data.takeaways : [];
    } catch (e) {
      summary = msgs.slice(-3).map((m) => m.text).join(" — ");
    }

    const entry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      summary,
      takeaways,
      moods: selectedMoods,
      provider: "hume",
      raw: msgs,
    };

    await saveEntry(entry);
    const e = await loadEntries();
    setEntries(e || []);
  }

  /* ---------- UI ---------- */
  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
      {view === "mood" ? (
        <div>
          <h2>How are you feeling right now?</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {MOODS.map((m) => {
              const on = selectedMoods.includes(m);
              return (
                <button
                  key={m}
                  onClick={() => toggleMood(m)}
                  aria-pressed={on}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 20,
                    border: on ? "1px solid #4a90e2" : "1px solid #ddd",
                    background: on ? "#eaf4ff" : "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{MOOD_EMOJI[m] || "•"}</span>
                  <span style={{ textTransform: "capitalize" }}>{m}</span>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 16 }}>
            <button onClick={() => setView("assistant")}>Next</button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
            <h2>Assistant</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setView("mood")}>Back</button>
              <button onClick={() => (window.location.href = "/history")}>
                History
              </button>
            </div>
          </div>

          {connectError && (
            <div style={{ color: "red" }}>Connection error: {connectError}</div>
          )}

          {selectedMoods.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <strong>Current mood:</strong>&nbsp;
              {selectedMoods.map((m) => (
                <span key={m} style={{ marginRight: 8 }}>
                  {MOOD_EMOJI[m]} {m}
                </span>
              ))}
            </div>
          )}

          <div style={{
              marginTop: 12,
              border: "1px solid #eee",
              padding: 12,
              minHeight: 150,
            }}>
            {messages.map((msg, i) => {
              if (!msg.message) return null;
              return (
                <div
                  key={i}
                  style={{
                    textAlign:
                      msg.message.role === "assistant" ? "left" : "right",
                    marginBottom: 8,
                  }}
                >
                  <div style={{
                      display: "inline-block",
                      padding: 8,
                      borderRadius: 6,
                      background:
                        msg.message.role === "assistant" ? "#fff" : "#4a90e2",
                      color:
                        msg.message.role === "assistant" ? "#111" : "#fff",
                    }}>
                    {msg.message.content}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 12 }}>
            {isHumeConnected() ? (
              <button onClick={handleDisconnect}>End Hume Session</button>
            ) : (
              <button onClick={handleConnect} disabled={connecting}>
                {connecting ? "Connecting..." : "Start Journaling Session"}
              </button>
            )}
            <button onClick={finishAndSave} style={{ marginLeft: 8 }}>
              Finish & Save
            </button>
          </div>

          <div style={{ marginTop: 26 }}>
            <h3>Recent Entries</h3>
            <ul>
              {entries.map((e) => (
                <li key={e.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {new Date(e.date).toLocaleString()}
                  </div>
                  <div>
                    {e.summary ||
                      (Array.isArray(e.takeaways)
                        ? e.takeaways.join(", ")
                        : e.takeaways || "—")}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
