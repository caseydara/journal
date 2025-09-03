
export function speak(text, opts = {}) {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    if (opts.lang) u.lang = opts.lang;
    if (opts.rate) u.rate = opts.rate;
    if (opts.pitch) u.pitch = opts.pitch;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
  
  export function stopSpeak() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }