// src/lib/stt.js
// Continuous SpeechRecognition wrapper with interim results and simple silence detection.
// Usage:
// const rec = startListening({ onPartial, onResult, onResultFallback, onError, lang, silenceTimeout });
// stopListening(rec);

export function startListening({
    onPartial,
    onResult,
    onResultFallback,
    onError,
    lang = 'en-US',
    interimResults = true,
    continuous = true,
    maxAlternatives = 1,
    silenceTimeout = 1800 // ms of no interim to treat as end-of-turn (optional)
  } = {}) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const err = new Error('SpeechRecognition not supported in this browser.');
      onError && onError(err);
      return null;
    }
  
    const rec = new SpeechRecognition();
    rec.lang = lang;
    rec.interimResults = interimResults;
    rec.continuous = continuous;
    rec.maxAlternatives = maxAlternatives;
  
    let lastInterim = '';
    let silenceTimer = null;
  
    function clearSilenceTimer() {
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    }
  
    function scheduleSilence() {
      clearSilenceTimer();
      if (silenceTimeout && silenceTimeout > 0) {
        silenceTimer = setTimeout(() => {
          silenceTimer = null;
          // if we have interim text but no final, call fallback
          if (lastInterim && onResultFallback) {
            const t = lastInterim;
            lastInterim = '';
            onResultFallback(t.trim());
          }
        }, silenceTimeout);
      }
    }
  
    rec.onstart = () => {
      // console.log('[STT] onstart');
    };
  
    rec.onaudiostart = () => {
      // console.log('[STT] onaudiostart');
    };
  
    rec.onaudioend = () => {
      // console.log('[STT] onaudioend');
    };
  
    rec.onend = () => {
      // console.log('[STT] onend');
      // If recognition ends naturally, trigger fallback if we have interim text
      clearSilenceTimer();
      if (lastInterim && onResultFallback) {
        const t = lastInterim;
        lastInterim = '';
        onResultFallback(t.trim());
      }
    };
  
    rec.onresult = (evt) => {
      // evt may include interim and/or final segments
      let interim = '';
      let final = '';
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const r = evt.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
  
      if (interim) {
        lastInterim = interim;
        onPartial && onPartial(interim.trim());
        // schedule silence detection after interim
        scheduleSilence();
      }
  
      if (final) {
        // got a final result
        lastInterim = '';
        clearSilenceTimer();
        onResult && onResult(final.trim());
      }
    };
  
    rec.onerror = (e) => {
      clearSilenceTimer();
      onError && onError(e);
    };
  
    try {
      rec.start();
    } catch (e) {
      // starting twice throws error; forward via onError
      onError && onError(e);
      return null;
    }
  
    // Return an object (the SpeechRecognition instance) that stopListening will accept
    return rec;
  }
  
  export function stopListening(rec) {
    try {
      if (rec && rec.stop) rec.stop();
    } catch (e) {
      // ignore
    }
  }