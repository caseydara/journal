import React, { useEffect, useState, useRef } from 'react';
import { speak } from './lib/voice';
import { loadEntries, saveEntry } from './lib/storage';
import { buildPromptsForToday } from './lib/promptBuilder';
import { startListening, stopListening } from './lib/stt';

export default function App() {
  const [entries, setEntries] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    (async () => {
      const e = await loadEntries();
      setEntries(e);
      const p = buildPromptsForToday(e);
      setPrompts(p);
      speak(`Hi! Let's do a quick check-in. ${p[0]}`);
    })();

    return () => {
      if (recognitionRef.current && recognitionRef.current.stop) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
    };
  }, []);

  const handleStart = () => {
    if (listening) return;
    setListening(true);
    recognitionRef.current = startListening({
      continuous: false,
      onPartial: (text) => {
        // update interim result in textarea
        setAnswers(prev => ({ ...prev, [index]: text }));
      },
      onResult: (finalText) => {
        setListening(false);
        setAnswers(prev => ({ ...prev, [index]: finalText }));
        speak('Got it. Say next to continue or press Next.');
      },
      onResultFallback: (lastInterim) => {
        // recognition ended without final result; keep the interim
        setListening(false);
        setAnswers(prev => ({ ...prev, [index]: lastInterim }));
        speak('I captured that. Press Next when ready.');
      },
      onError: (err) => {
        setListening(false);
        console.error('STT error', err);
      }
    });
  };

  const handleStop = () => {
    if (!listening) return;
    stopListening(recognitionRef.current);
    setListening(false);
  };

  const onNext = async () => {
    if (listening) {
      handleStop();
      // give the recognition a moment to fire onend/onResultFallback
      await new Promise(r => setTimeout(r, 200));
    }

    if (index < prompts.length - 1) {
      const next = index + 1;
      setIndex(next);
      speak(prompts[next]);
      return;
    }

    const entry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      prompts: prompts.map((p, idx) => ({ promptText: p, responseText: answers[idx] || '' })),
      mood: answers[1] || null,
      takeaways: answers[prompts.length - 1] || ''
    };

    await saveEntry(entry);
    const e = await loadEntries();
    setEntries(e);
    setAnswers({});
    setIndex(0);
    const p = buildPromptsForToday(e);
    setPrompts(p);
    speak('Saved. Great job!');
    speak(p[0]);
  };

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Assistant</h2>
        <div>
          <button onClick={() => { const text = prompts[index] || 'No prompt'; speak(text); }}>Replay Prompt</button>
          <button onClick={() => window.location.href = '/history'} style={{ marginLeft: 8 }}>History</button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ color: '#666' }}>Prompt {index + 1} / {prompts.length}</div>
        <div style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>{prompts[index]}</div>

        <div style={{ marginTop: 12 }}>
          <label><strong>Answer (voice or type):</strong></label>
          <textarea
            rows={5}
            style={{ width: '100%', padding: 8, marginTop: 6 }}
            value={answers[index] || ''}
            onChange={(e) => setAnswers(prev => ({ ...prev, [index]: e.target.value }))}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <button onClick={() => listening ? handleStop() : handleStart()}>
            {listening ? 'Stop' : 'Talk'}
          </button>
          <button onClick={onNext} style={{ marginLeft: 8 }}>Next</button>
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <h3>Recent Entries</h3>
        <ul>
          {entries.map(e => (
            <li key={e.id} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#666' }}>{new Date(e.date).toLocaleString()}</div>
              <div>{e.takeaways || (e.prompts && e.prompts[0]?.responseText) || '—'}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}