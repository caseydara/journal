import { useCallback, useEffect, useRef } from 'react';
import { useVoice } from '@humeai/voice-react';

export default function useHumeChat() {
  const voice = useVoice();
  const messages = voice?.messages ?? [];
  const resolversRef = useRef([]);
  const lastIndexRef = useRef(0);

  useEffect(() => {
    const msgs = messages || [];
    for (let i = lastIndexRef.current; i < msgs.length; i++) {
      const m = msgs[i];
      const payload = m?.message ?? m;
      const type = (m && m.type) || payload?.type || null;
      const role = payload?.role || null;
      const text = payload?.content ?? payload?.text ?? null;

      const isAssistant =
        role === 'assistant' ||
        String(type || '').toLowerCase().includes('assistant') ||
        String(payload?.role || '').toLowerCase().includes('assistant');

      if (isAssistant && text) {
        const next = resolversRef.current.shift();
        if (next) next.resolve(text);
      }
    }
    lastIndexRef.current = msgs.length;
  }, [messages]);

  const sendMessageToHume = useCallback(
    async (userText, timeoutMs = 20000) => {
      if (!userText || !userText.trim()) return '';
      const sendFn = voice?.sendUserInput ? voice.sendUserInput.bind(voice) : null;
      if (!sendFn) throw new Error('Hume sendUserInput not available (ensure VoiceProvider & connect)');

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = resolversRef.current.findIndex(r => r.resolve === resolve);
          if (idx >= 0) resolversRef.current.splice(idx, 1);
          reject(new Error('Timeout waiting for assistant reply'));
        }, timeoutMs);

        resolversRef.current.push({
          resolve: (text) => {
            clearTimeout(timer);
            resolve(text);
          },
          reject
        });

        try {
          sendFn(userText);
        } catch (e) {
          clearTimeout(timer);
          resolversRef.current = resolversRef.current.filter(r => r.resolve !== resolve);
          reject(e);
        }
      });
    },
    [voice]
  );

  return { sendMessageToHume, voice };
}