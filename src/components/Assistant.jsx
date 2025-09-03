// src/components/Assistant.jsx
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { speak } from '../lib/voice';
import { loadEntries, saveEntry } from '../lib/storage';
import { buildPromptsForToday } from '../lib/promptBuilder';
import { startListening, stopListening } from '../lib/stt';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function Assistant() {

    // moods list and emoji map (put near other constants at top of Assistant.jsx)
const MOODS = [
    'happy','excited','proud','grateful','content','calm','productive',
    'bored','unmotivated','annoyed','fearful','lonely','sad','depressed','shame','guilty','love'
  ];
  
  const MOOD_EMOJI = {
    happy: '😄', excited: '🤩', proud: '🏆', grateful: '🙏', content: '🙂',
    calm: '😌', productive: '💪', bored: '😐', unmotivated: '😕',
    annoyed: '😠', fearful: '😨', lonely: '😔', sad: '😢', depressed: '😞',
    shame: '😳', guilty: '😖', love: '❤️'
  };

  

  const [selectedMoods, setSelectedMoods] = useState([]);
  const [entries, setEntries] = useState([]);
  const [conversation, setConversation] = useState([]); // {role, text}
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [view, setView] = useState('mood'); // 'mood' or 'assistant'

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const silenceTimeout = 900; // ms to consider silence -> end-of-turn

  const assistantSpeakingRef = useRef(false);
  const finalizeTimerRef = useRef(null);
  const stopPausedRef = useRef(false); // NEW: pause flag when user hits Stop
  const GRACE_PERIOD = 600; // ms extra grace after STT signals silence

  useEffect(() => {
    (async () => {
      const e = await loadEntries();
      setEntries(e);
      const opener = 'What did you do today?';
      pushAssistant(opener);
      speak(opener);
      // start listening after assistant speaks
      setTimeout(() => startAutoListenIfReady(), 600);
    })();

    return () => {
      clearSilenceTimer();
      clearFinalizeTimer();
      if (recognitionRef.current) {
        try { stopListening(recognitionRef.current); } catch (e) {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- helpers --- */
  function pushAssistant(text) {
    setConversation(prev => [...prev, { role: 'assistant', text }]);
  }
  function pushUser(text) {
    setConversation(prev => [...prev, { role: 'user', text }]);
  }

  function toggleMood(m) {
    setSelectedMoods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  async function requestFollowUps(latestReply) {
    try {
      const resp = await axios.post(`${API_URL}/generate-followup`, {
        latestReply,
        moods: selectedMoods // include current moods
      });
      return resp.data.follow_up || [];
    } catch (e) {
      console.warn('generate-followup failed', e);
      return null;
    }
  }

  async function requestSummary(messages) {
    try {
      const resp = await axios.post(`${API_URL}/summarize`, { messages });
      return resp.data;
    } catch (e) {
      console.warn('summarize failed', e);
      return null;
    }
  }

  function clearSilenceTimer() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }
  function scheduleSilenceFinalize(finalCallback) {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      finalCallback();
    }, silenceTimeout);
  }

  function clearFinalizeTimer() {
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
  }

  function startAutoListenIfReady() {
    if (assistantSpeakingRef.current) return;
    if (stopPausedRef.current) return; // respect pause
    startContinuousListening();
  }

  /* --- STT control --- */
  function startContinuousListening() {
    if (listening) return;
    setInterimText('');
    setListening(true);

    // start recognition
    recognitionRef.current = startListening({
      continuous: true,
      onPartial: (partial) => {
        // user keeps speaking -> cancel finalize timer
        clearFinalizeTimer();
        setInterimText(partial);
        scheduleSilenceFinalize(() => {
          // when STT signals silence, give a small grace before finalizing
          clearFinalizeTimer();
          finalizeTimerRef.current = setTimeout(async () => {
            finalizeTimerRef.current = null;
            await finalizeUserTurn(partial);
          }, GRACE_PERIOD);
        });
      },
      onResult: async (finalText) => {
        clearSilenceTimer();
        clearFinalizeTimer();
        setInterimText('');
        setListening(false);
        recognitionRef.current = null;
        await finalizeUserTurn(finalText);
      },
      onResultFallback: async (lastInterim) => {
        // STT indicated likely end -> wait GRACE_PERIOD then finalize
        clearSilenceTimer();
        clearFinalizeTimer();
        finalizeTimerRef.current = setTimeout(async () => {
          finalizeTimerRef.current = null;
          setInterimText('');
          setListening(false);
          recognitionRef.current = null;
          if (lastInterim) await finalizeUserTurn(lastInterim);
        }, GRACE_PERIOD);
      },
      onError: (err) => {
        console.warn('STT error', err);
        clearSilenceTimer();
        clearFinalizeTimer();
        setListening(false);
        recognitionRef.current = null;
      }
    });
  }

  async function stopContinuousListening() {
    // Pause conversation and prevent auto restart until user resumes
    stopPausedRef.current = true;
    clearSilenceTimer();
    clearFinalizeTimer();

    try {
      if (recognitionRef.current) stopListening(recognitionRef.current);
    } catch (e) { /* ignore */ }

    recognitionRef.current = null;
    setListening(false);
    setInterimText('');

    // leave paused state until user manually starts listening again
    // (do not auto-clear stopPausedRef here)
  }

  /* --- finalization --- */
  async function finalizeUserTurn(text) {
    const userText = (text || '').trim();
    if (!userText) {
      pushAssistant("I didn't catch that. Want to try again?");
      speak("I didn't catch that. Want to try again?");
      setTimeout(() => {
        // only auto-resume if not paused
        if (!stopPausedRef.current) startAutoListenIfReady();
      }, 600);
      return;
    }

    pushUser(userText);
    // stop listening while assistant thinks
    stopContinuousListening();

    pushAssistant('Let me think...');
    assistantSpeakingRef.current = true;

    const followUps = await requestFollowUps(userText);

    // remove 'Let me think...' placeholder
    setConversation(prev => {
      const copy = [...prev];
      if (copy.length > 0 && copy[copy.length - 1].role === 'assistant' && copy[copy.length - 1].text === 'Let me think...') {
        copy.pop();
      }
      return copy;
    });

    if (followUps && followUps.length > 0) {
      const follow = followUps[0];
      pushAssistant(follow);
      speak(follow);
    } else {
      const fallback = "Tell me more about that.";
      pushAssistant(fallback);
      speak(fallback);
    }

    // after assistant speech, resume listening only if not paused
    setTimeout(() => {
      assistantSpeakingRef.current = false;
      if (!stopPausedRef.current) startAutoListenIfReady();
    }, 800);
  }

  /* --- manual controls --- */
  function handleManualStop() {
    // Pause the conversation: stop recognition and prevent auto-restart
    clearSilenceTimer();
    clearFinalizeTimer();
    stopContinuousListening();
    setInterimText('');
  }

  function handleManualStart() {
    // Unpause and start listening
    stopPausedRef.current = false;
    startAutoListenIfReady();
  }

  /* --- finish/save --- */
  async function finishAndSave() {
    stopContinuousListening();
    const msgs = conversation.map(m => ({ role: m.role, text: m.text }));
    const summaryResp = await requestSummary(msgs);
    const summary = summaryResp?.summary || msgs.slice(-3).map(m => m.text).join(' — ');
    const takeaways = summaryResp?.takeaways || [];
    const entry = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        summary,
        takeaways: Array.isArray(takeaways) ? takeaways : (takeaways ? [takeaways] : []),
        moods: Array.isArray(selectedMoods) ? selectedMoods : (selectedMoods ? [selectedMoods] : []),
        raw: msgs
      };
    await saveEntry(entry);
    const e = await loadEntries();
    setEntries(e);
    setConversation([]);
    pushAssistant('Saved. Would you like to check in again later?');
    speak('Saved. Would you like to check in again later?');
  }

  /* --- UI --- */
  return (
    <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      {view === 'mood' ? (
        // Mood selection view
        <div>
          <h2>How are you feeling right now?</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MOODS.map(m => {
              const on = selectedMoods.includes(m);
              return (
                <button
                  key={m}
                  onClick={() => toggleMood(m)}
                  aria-pressed={on}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 20,
                    border: on ? '1px solid #4a90e2' : '1px solid #ddd',
                    background: on ? '#eaf4ff' : 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <span style={{ fontSize: 16 }}>{MOOD_EMOJI[m] || '•'}</span>
                  <span style={{ textTransform: 'capitalize' }}>{m}</span>
                </button>
              );
            })}
          </div>
  
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => {
                // move to assistant view; seed opener according to mood
                const opener = selectedMoods.length > 0
                  ? `You said you feel ${selectedMoods.join(', ')}. Tell me more.`
                  : 'How are you doing today?';
                pushAssistant(opener);
                speak(opener);
                setView('assistant');
                // start listening after a short delay
                setTimeout(() => startAutoListenIfReady(), 600);
              }}
              disabled={false}
            >
              Next
            </button>
          </div>
        </div>
      ) : (
        // Assistant view
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h2>Assistant</h2>
            <div>
              <button onClick={() => { const last = conversation.slice().reverse().find(m => m.role === 'assistant'); if (last) speak(last.text); }}>Replay</button>
              <button onClick={() => setView('mood')} style={{ marginLeft: 8 }}>Back</button>
              <button onClick={() => window.location.href = '/history'} style={{ marginLeft: 8 }}>History</button>
            </div>
          </div>
  
          {selectedMoods.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <strong>Current mood:</strong>&nbsp;
              {selectedMoods.map(m => <span key={m} style={{ marginRight: 8 }}>{MOOD_EMOJI[m]} {m}</span>)}
            </div>
          )}
  
          <div style={{ marginTop: 12, border: '1px solid #eee', padding: 12, minHeight: 150 }}>
            {conversation.map((m, i) => (
              <div key={i} style={{ textAlign: m.role === 'assistant' ? 'left' : 'right', marginBottom: 8 }}>
                <div style={{ display: 'inline-block', padding: 8, borderRadius: 6, background: m.role === 'assistant' ? '#fff' : '#4a90e2', color: m.role === 'assistant' ? '#111' : '#fff' }}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
  
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#666' }}>Listening: {listening ? 'Yes' : 'No'}</div>
            <div style={{ marginTop: 8, minHeight: 24, color: '#333' }}>{interimText || <em>Say something when you're ready...</em>}</div>
            <div style={{ marginTop: 12 }}>
              <button onClick={handleManualStart}>{listening ? 'Listening...' : 'Start Listening'}</button>
              <button onClick={handleManualStop} style={{ marginLeft: 8 }}>Pause</button>
              <button onClick={finishAndSave} style={{ marginLeft: 8 }}>Finish & Save</button>
            </div>
          </div>
          <div style={{ marginTop: 26 }}>
        <h3>Recent Entries</h3>
        <ul>
          {entries.map(e => (
            <li key={e.id} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#666' }}>{new Date(e.date).toLocaleString()}</div>
              <div>{e.summary || (Array.isArray(e.takeaways) ? e.takeaways.join(', ') : (e.takeaways || '—'))}</div>
            </li>
          ))}
        </ul>
      </div>
        </div>

        
      )}
      {/* recent entries list always visible below */}
    </div>
  );
}