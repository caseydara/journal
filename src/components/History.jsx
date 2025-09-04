// src/components/History.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { loadEntries, clearEntries } from '../lib/storage';
import { speak } from '../lib/voice';

// mood emoji map (keep in sync with Assistant)
const MOOD_EMOJI = {
  happy: '😄', excited: '🤩', proud: '🏆', grateful: '🙏', content: '🙂',
  calm: '😌', productive: '💪', bored: '😐', unmotivated: '😕',
  annoyed: '😠', fearful: '😨', lonely: '😔', sad: '😢', depressed: '😞',
  shame: '😳', guilty: '😖', love: '❤️'
};

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function monthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function daysInMonth(date) {
  const start = monthStart(date);
  const end = monthEnd(date);
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

function normalizeEntries(entries = []) {
  return entries.map(e => ({
    ...e,
    dateObj: new Date(e.date),
    moods: Array.isArray(e.moods) ? e.moods : (e.moods ? [e.moods] : []),
    tags: Array.isArray(e.tags) ? e.tags : (e.tags ? e.tags : [])
  }));
}

function aggregateMonth(entries = [], year, month) {
  // year: yyyy, month: 0-11
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const mapByDay = {};
  const moodCounts = {};
  const tagCounts = {};

  entries.forEach(e => {
    const d = new Date(e.date);
    if (d < start || d > end) return;
    const day = isoDay(d);
    if (!mapByDay[day]) mapByDay[day] = { entries: [], moodCounts: {} };
    mapByDay[day].entries.push(e);

    // moods
    const moods = Array.isArray(e.moods) ? e.moods : (e.moods ? [e.moods] : []);
    moods.forEach(m => {
      if (!m) return;
      mapByDay[day].moodCounts[m] = (mapByDay[day].moodCounts[m] || 0) + 1;
      moodCounts[m] = (moodCounts[m] || 0) + 1;
    });

    // tags: prefer explicit tags, else extract from takeaways/summary
    let tags = Array.isArray(e.tags) ? e.tags : [];
    if (!tags.length && e.takeaways && Array.isArray(e.takeaways)) {
      tags = e.takeaways.slice(0, 3).map(t => t.toLowerCase());
    } else if (!tags.length && e.summary) {
      // crude keyword extraction: split and take frequent words (not robust)
      const words = (e.summary || '').toLowerCase().split(/\W+/).filter(Boolean);
      tags = words.slice(0, 3);
    }
    tags.forEach(t => {
      if (!t) return;
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });

  // determine dominant mood per day
  Object.keys(mapByDay).forEach(day => {
    const mc = mapByDay[day].moodCounts;
    const dominant = Object.keys(mc).length ? Object.keys(mc).reduce((a,b) => mc[a] >= mc[b] ? a : b) : null;
    mapByDay[day].dominant = dominant;
  });

  return { mapByDay, moodCounts, tagCounts };
}

export default function History() {
  const [entriesRaw, setEntriesRaw] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState(null); // 'YYYY-MM-DD'

  useEffect(() => {
    (async () => {
      const e = await loadEntries();
      setEntriesRaw(Array.isArray(e) ? e : []);
    })();
  }, []);

  const entries = useMemo(() => normalizeEntries(entriesRaw), [entriesRaw]);

  const { mapByDay, moodCounts, tagCounts } = useMemo(() => {
    return aggregateMonth(entries, currentMonth.year, currentMonth.month);
  }, [entries, currentMonth]);

  const days = useMemo(() => daysInMonth(new Date(currentMonth.year, currentMonth.month, 1)), [currentMonth]);

  function goPrevMonth() {
    setSelectedDay(null);
    setCurrentMonth(prev => {
      const d = new Date(prev.year, prev.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }
  function goNextMonth() {
    setSelectedDay(null);
    setCurrentMonth(prev => {
      const d = new Date(prev.year, prev.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function clearAll() {
    if (!window.confirm('Clear all entries?')) return;
    clearEntries();
    setEntriesRaw([]);
    setSelectedDay(null);
  }

  const moodEntries = Object.entries(moodCounts).sort((a,b) => b[1]-a[1]);
  const tagEntries = Object.entries(tagCounts).sort((a,b) => b[1]-a[1]).slice(0, 3);

  const monthLabel = new Date(currentMonth.year, currentMonth.month, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="app-shell">
      {/* Header */}
      <div className="app-header">
        <h2 className="app-title">History &amp; Mood Dashboard</h2>
        <div className="toolbar">
          <button className="btn" onClick={() => window.location.href = '/'}>Back</button>
          <button className="btn btn-plain" onClick={clearAll}>Clear all</button>
        </div>
      </div>

      <div className="app-body">
        {/* Month nav */}
        <div className="card pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn" onClick={goPrevMonth}>◀</button>
            <div style={{ fontWeight: 600 }}>{monthLabel}</div>
            <button className="btn" onClick={goNextMonth}>▶</button>
          </div>
          <div className="meta">Viewing {monthLabel}</div>
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          {/* Calendar column */}
          <div className="card pad" style={{ flex: '1 1 600px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {days.map(d => {
                const iso = isoDay(d);
                const cell = mapByDay[iso];
                const dominant = cell?.dominant;
                const emoji = dominant ? (MOOD_EMOJI[dominant] || '•') : '';
                const isToday = iso === isoDay(new Date());
                const border = selectedDay === iso ? '2px solid #4a90e2' : '1px solid #eee';
                const bg = cell ? '#fff' : '#fafafa';
                return (
                  <div
                    key={iso}
                    onClick={() => setSelectedDay(iso)}
                    role="button"
                    tabIndex={0}
                    className="card pad"
                    style={{
                      border,
                      padding: 8,
                      minHeight: 88,
                      background: bg,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ fontSize: 12, color: isToday ? '#4a90e2' : '#666' }}>
                      {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 28, textAlign: 'center' }}>{emoji}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>
                      {cell ? `${cell.entries.length} entry${cell.entries.length>1?'s':''}` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right column: charts + details */}
          <div style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card pad">
              <h4 style={{ marginTop: 0 }}>Mood distribution (this month)</h4>
              {moodEntries.length === 0 ? (
                <div className="meta">No moods for this month.</div>
              ) : (
                moodEntries.map(([mood, count]) => (
                  <div key={mood} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ width: 28 }}>{MOOD_EMOJI[mood] || '•'}</div>
                    <div style={{ flex: 1, marginLeft: 8, marginRight: 8 }}>
                      <div style={{ height: 10, background: '#eee', borderRadius: 4 }}>
                        <div
                          style={{
                            width: `${(count / Math.max(1, moodEntries[0][1])) * 100}%`,
                            height: '100%',
                            background: '#4a90e2',
                            borderRadius: 4
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ minWidth: 28, textAlign: 'right' }}>{count}</div>
                  </div>
                ))
              )}
            </div>

            <div className="card pad">
              <h4 style={{ marginTop: 0 }}>Top themes (this month)</h4>
              {tagEntries.length === 0 ? (
                <div className="meta">No themes for this month.</div>
              ) : (
                tagEntries.map(([tag, count]) => (
                  <div key={tag} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ flex: 1, textTransform: 'capitalize' }}>{tag}</div>
                    <div style={{ width: 120, marginLeft: 8 }}>
                      <div style={{ height: 10, background: '#eee', borderRadius: 4 }}>
                        <div
                          style={{
                            width: `${(count / Math.max(1, tagEntries[0][1])) * 100}%`,
                            height: '100%',
                            background: '#f6a623',
                            borderRadius: 4
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ width: 40, textAlign: 'right', marginLeft: 8 }}>{count}</div>
                  </div>
                ))
              )}
            </div>

            <div className="card pad">
              <h4 style={{ marginTop: 0 }}>Day detail</h4>
              {selectedDay ? (
                <>
                  <div className="meta" style={{ marginBottom: 8 }}>
                    {new Date(selectedDay).toLocaleDateString()}
                  </div>
                  {mapByDay[selectedDay] && mapByDay[selectedDay].entries.length > 0 ? (
                    mapByDay[selectedDay].entries.map(en => (
                      <div key={en.id} style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ fontSize: 12, color: '#666' }}>
                          {new Date(en.date).toLocaleTimeString()}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          {en.summary || en.raw?.[0]?.text || '(no summary)'}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12 }}>
                          {Array.isArray(en.moods) ? en.moods.join(', ') : (en.moods || '')}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
                          {Array.isArray(en.tags) ? en.tags.join(', ') : (en.tags || '')}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="meta">No entries for this day.</div>
                  )}
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button
                      className="btn"
                      onClick={() => {
                        const e = mapByDay[selectedDay]?.entries?.[0];
                        if (e) speak(e.summary || e.raw?.[0]?.text || 'No content');
                      }}
                    >
                      Play first
                    </button>
                    <button className="btn btn-plain" onClick={() => setSelectedDay(null)}>
                      Close
                    </button>
                  </div>
                </>
              ) : (
                <div className="meta">Select a day to see entries</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
