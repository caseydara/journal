export function aggregateMoodsByDay(entries) {
    const map = {};
    entries.forEach(e => {
      const day = (new Date(e.date)).toISOString().slice(0,10); // YYYY-MM-DD
      if (!map[day]) map[day] = { counts: {}, entries: [] };
      map[day].entries.push(e);
      const moods = Array.isArray(e.moods) ? e.moods : (e.moods ? [e.moods] : []);
      moods.forEach(m => { map[day].counts[m] = (map[day].counts[m] || 0) + 1; });
    });
    Object.keys(map).forEach(day => {
      const counts = map[day].counts;
      const dominant = Object.keys(counts).length
        ? Object.keys(counts).reduce((a,b) => counts[a] >= counts[b] ? a : b)
        : null;
      map[day].dominant = dominant;
    });
    return map;
  }