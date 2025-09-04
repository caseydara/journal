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

// (kept for compatibility, but we won't send it as a user message anymore)
const MEMORY_TAG = "[[MEMORY_PRIMER]]";

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
  const startupSpokenRef = useRef(false); // ensure we only send the opener once per connection

  // Load history on mount
  useEffect(() => {
    (async () => {
      const e = await loadEntries();
      setEntries(e || []);
    })();
  }, []);

  // Once connected, say the opener immediately (no pause)
  useEffect(() => {
    if (readyState === VoiceReadyState.OPEN && pendingOpener && !startupSpokenRef.current) {
      startupSpokenRef.current = true;
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

    if (lastLabel === "positive" && todayLabel === "negative") {
      return `Last time you were feeling ${lastText}, but now you’re feeling ${todayText}. Do you want to talk about what changed?`;
    }
    if (lastLabel === "negative" && todayLabel === "positive") {
      return `Previously you felt ${lastText}, but now you’re feeling ${todayText} — that’s great to hear! What changed?`;
    }
    if (lastLabel === todayLabel) {
      return `You mentioned feeling ${lastText} before, and now ${todayText}. Want to share more about that?`;
    }

    return `I see you’re feeling ${todayText}. How are things going since last time?`;
  }

  // Build a concise memory primer (but we'll pass it via sessionSettings.meta so it won't render)
  function buildMemoryPrimer(allEntries, limit = 5, maxChars = 1200) {
    if (!Array.isArray(allEntries) || allEntries.length === 0) return null;
    const recent = allEntries.slice(-limit);
    const lines = recent.map((e) => {
      const when = new Date(e.date).toLocaleDateString();
      const mood = Array.isArray(e.moods) && e.moods.length ? `mood: ${e.moods.join(", ")}` : null;
      const take = Array.isArray(e.takeaways) && e.takeaways.length ? `takeaways: ${e.takeaways.join("; ")}` : null;
      const sum = e.summary ? `summary: ${e.summary}` : null;
      return [`• ${when}`, mood, take, sum].filter(Boolean).join(" — ");
    });

    const header =
      `${MEMORY_TAG}\n` +
      `Context for today’s chat (do not read aloud). Weave in relevant past details briefly; avoid long recaps.\n\nRecent entries:\n`;

    let body = "";
    for (const l of lines) {
      if ((header.length + body.length + l.length + 1) > maxChars) break;
      body += (l + "\n");
    }

    return (header + body.trimEnd());
  }

  /* ---------- Hume connect / disconnect ---------- */
  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    startupSpokenRef.current = false;
    try {
      console.log(API_URL)
      console.log(process.env.REACT_APP_API_URL)
      const resp = await fetch(`${API_URL}/hume-token`);
      const j = await resp.json();
      if (!j.accessToken) throw new Error("no token");

      const lastEntry = entries.length ? entries[entries.length - 1] : null;
      const opener = buildProgressiveOpener(selectedMoods, lastEntry);
      setPendingOpener(opener);

      // Build the primer but DO NOT send it as a user message.
      // Instead, pass inside sessionSettings.meta so it informs EVI without creating a bubble or delay.
      const primer = buildMemoryPrimer(entries) || "";

      await connect({
        auth: { type: "accessToken", value: j.accessToken },
        configId: EVI_CONFIG_ID,
        // Keep your existing behavior; just add the primer into meta
        sessionSettings: {
          meta: {
            moods: selectedMoods,
            memoryPrimer: primer, // <-- context delivered silently with the session
          }
        },
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
      .map((m) => {
        const text = String(m.message.content || "").trim();
        return { role: m.message.role, text };
      })
      // also skip any stray memory-tagged content (defensive)
      .filter((m) => m.text && !m.text.startsWith(MEMORY_TAG));

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
   // Top-level wrapper:
<div className="app-shell">
  {view === "mood" ? (
    <div className="app-body">
      <div className="app-header">
        <h2 className="app-title">How are you feeling right now?</h2>
        <div className="toolbar">
          <button className="btn btn-primary" onClick={() => setView("assistant")}>Next</button>
        </div>
      </div>

      <div className="card pad">
        <div className="pills">
          {MOODS.map(m => {
            const on = selectedMoods.includes(m);
            return (
              <button
                key={m}
                className="pill"
                aria-pressed={on}
                onClick={() => toggleMood(m)}
              >
                <span style={{ fontSize: 16 }}>{MOOD_EMOJI[m] || "•"}</span>
                <span style={{ textTransform: "capitalize" }}>{m}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  ) : (
    <div className="app-body">
      <div className="app-header">
        <h2 className="app-title">Assistant</h2>
        <div className="toolbar">
          <button className="btn" onClick={() => setView("mood")}>Back</button>
          <button className="btn" onClick={() => (window.location.href = "/history")}>History</button>
          {isHumeConnected() ? (
            <button className="btn btn-plain" onClick={handleDisconnect}>End Session</button>
          ) : (
            <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
              {connecting ? "Connecting..." : "Start Journaling Session"}
            </button>
          )}
          <button className="btn" onClick={finishAndSave}>Finish & Save</button>
        </div>
      </div>

      {connectError && (
        <div className="card pad" style={{ color: "red" }}>
          Connection error: {connectError}
        </div>
      )}

      {selectedMoods.length > 0 && (
        <div className="card pad meta">
          <strong>Current mood:</strong>
          {selectedMoods.map(m => (
            <span key={m} className="kv">
              <span>{MOOD_EMOJI[m]} {m}</span>
            </span>
          ))}
        </div>
      )}

      <div className="chat-window">
        {messages.map((msg, i) => {
          if (!msg.message) return null;
          const role = msg.message.role === "assistant" ? "assistant" : "user";
          const content = String(msg.message.content || "").trim();
          if (!content) return null;
          return (
            <div key={i} className={`bubble-row ${role}`}>
              <div className={`bubble ${role}`}>{content}</div>
            </div>
          );
        })}
      </div>

      <div className="card pad">
        <h3 style={{ marginTop: 0 }}>Recent Entries</h3>
        <ul className="list">
          {entries.map(e => (
            <li key={e.id}>
              <div style={{ fontSize: 12, color: "#666" }}>
                {new Date(e.date).toLocaleString()}
              </div>
              <div>
                {e.summary ||
                  (Array.isArray(e.takeaways) ? e.takeaways.join(", ") : (e.takeaways || "—"))}
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
