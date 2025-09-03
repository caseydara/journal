// src/components/History.jsx
import React, { useEffect, useState } from 'react';
import { loadEntries } from '../lib/storage';
import { speak } from '../lib/voice';

export default function History() {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    (async () => {
      const e = await loadEntries();
      setEntries(e);
    })();
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>History</h2>
        <div>
          <button onClick={() => window.location.href = '/'}>Back</button>
        </div>
      </div>

      <p style={{ color: '#666' }}>Your past journal entries. Click "Play" to hear the saved takeaway.</p>

      <div style={{ marginTop: 12 }}>
        {entries.length === 0 && <div>No entries yet.</div>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {entries.map(entry => (
            <li key={entry.id} style={{ padding: 12, borderBottom: '1px solid #eee' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#666' }}>{new Date(entry.date).toLocaleString()}</div>
                  <div style={{ marginTop: 6 }}>{entry.takeaways || (entry.prompts && entry.prompts[0]?.responseText) || '—'}</div>
                </div>
                <div style={{ marginLeft: 12 }}>
                  <button onClick={() => speak(entry.takeaways || (entry.prompts && entry.prompts[0]?.responseText) || 'No content')}>Play</button>
                  <button style={{ marginLeft: 8 }} onClick={async () => {
                    // simple export: copy entry JSON to clipboard
                    try {
                      await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
                      alert('Entry JSON copied to clipboard.');
                    } catch (e) {
                      alert('Copy failed. See console for details.');
                      console.error(e);
                    }
                  }}>Export</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}