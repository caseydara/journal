// src/lib/storage.js
const STORE_KEY = 'ai-journal-entries-v1';

export async function loadEntries() {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return v ? JSON.parse(v) : [];
  } catch (e) {
    console.error('loadEntries error', e);
    return [];
  }
}

export async function saveEntry(entry) {
  try {
    const all = await loadEntries();
    all.unshift(entry);
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
    return entry;
  } catch (e) {
    console.error('saveEntry error', e);
    return null;
  }
}

export async function clearEntries() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch (e) {
    console.error('clearEntries error', e);
  }
}