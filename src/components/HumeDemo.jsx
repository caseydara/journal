"use client";

import React, { useEffect, useState } from "react";
import { VoiceProvider, useVoice, VoiceReadyState } from "@humeai/voice-react";

/**
 * StartCall: start / end the EVI session using the useVoice hook.
 * Expects an accessToken prop (string).
 */

const EVI_CONFIG_ID = process.env.NEXT_PUBLIC_HUME_CONFIG_ID || 'e542db5e-a7f9-409f-914f-c2a060d7dc5b';

function StartCall({ accessToken }) {
  const { connect, disconnect, readyState } = useVoice();

  if (readyState === VoiceReadyState.OPEN) {
    return (
      <button
        onClick={() => {
          disconnect();
        }}
      >
        End Session
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        // Must be triggered by user gesture
        connect({
          auth: { type: "accessToken", value: accessToken },
        })
          .then(() => {
            console.log('Hume connect success:');
          })
          .catch((err) => {
            console.error("connect error", err);
            alert("Failed to connect to Hume EVI. See console.");
          });
      }}
    >
      Start Session
    </button>
  );
}

/**
 * Messages: simple render of useVoice messages. Filters out internal events.
 */
function Messages() {
  const { messages } = useVoice();

  return (
    <div style={{ border: "1px solid #eee", padding: 12, height: 340, overflowY: "auto" }}>
      {messages.map((msg, i) => {
        // many messages from SDK; show user/assistant messages if available
        const payload = msg?.message;
        if (!payload || (!payload.role && !payload.content && !payload.text)) {
          // show generic event line for debugging if desired
          return (
            <div key={i} style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>
              [{msg.type}] {JSON.stringify(msg)}
            </div>
          );
        }
        return (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#666" }}>{payload.role}</div>
            <div style={{ padding: 8, background: payload.role === "assistant" ? "#fff" : "#4a90e2", color: payload.role === "assistant" ? "#111" : "#fff", borderRadius: 8 }}>
              {payload.content || payload.text || ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * HumeDemoPage: main page component
 * - fetches token from server
 * - renders VoiceProvider with StartCall + Messages
 */
export default function HumeDemoPage() {
  const [accessToken, setAccessToken] = useState(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [tokenError, setTokenError] = useState(null);

  useEffect(() => {
    // Use configured server base URL or fallback to localhost:3001
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
    const url = `${API_URL.replace(/\/$/, "")}/hume-token`;

    setLoadingToken(true);
    fetch(url, { method: "GET" })
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(`${r.status} ${r.statusText} -> ${txt}`);
        }
        return r.json();
      })
      .then((j) => {
        if (j.accessToken) {
          setAccessToken(j.accessToken);
        } else {
          throw new Error("No accessToken in response");
        }
      })
      .catch((err) => {
        console.error("Failed fetching Hume token:", err);
        setTokenError(String(err));
      })
      .finally(() => setLoadingToken(false));
  }, []);

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h2>Hume EVI Demo (separate page)</h2>

      {loadingToken && <div>Loading access token...</div>}

      {tokenError && (
        <div style={{ color: "red" }}>
          Error fetching token: {tokenError}
          <div style={{ marginTop: 8 }}>Ensure your server /hume-token endpoint is running and server/.env is set.</div>
        </div>
      )}

      {accessToken && (
        <VoiceProvider configId={EVI_CONFIG_ID}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <StartCall accessToken={accessToken} />
            <div style={{ fontSize: 12, color: "#666" }}>Microphone & audio will be requested on connect.</div>
          </div>

          <Messages />

          <div style={{ marginTop: 12 }}>
            <small style={{ color: "#666" }}>
              Notes: This page uses Hume's React SDK (EVI). Use this page for experimenting with Hume before integrating into your main flow.
            </small>
          </div>
        </VoiceProvider>
      )}
    </div>
  );
}