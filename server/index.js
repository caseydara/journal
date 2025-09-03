// server/index.js (modern OpenAI SDK)
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function tryParseJSON(text) {
  try { return JSON.parse(text); }
  catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e2) {}
    }
    return null;
  }
}

app.post('/generate-followup', async (req, res) => {
  const { latestReply, contextSummary = '', maxFollowups = 3 } = req.body || {};
  if (!latestReply) return res.status(400).json({ error: 'missing latestReply' });

  const system = `You are a private, empathetic journaling companion whose goal is to make daily self-reflection simple, consistent, and insightful. Use a warm, nonjudgmental, conversational tone. Produce 2–3 short, open-ended follow-up questions that invite reflection, clarify feelings, or suggest small next steps. Return JSON only in the form {"follow_up": ["...","..."]}. Keep questions under 12 words when possible. Do not add any commentary outside the JSON.`;

  const user = `Latest reply: """${latestReply}"""
Context: """${contextSummary}"""
Return up to ${maxFollowups} short, empathetic, conversational follow-up questions.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // or gpt-4 if available
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.8,
      max_tokens: 200
    });

    // Inspect response shape and extract text
    // New SDK returns response.choices array with .message.content
    const choice = response.choices && response.choices[0];
    const text = choice?.message?.content ?? (typeof choice === 'string' ? choice : null);

    const parsed = tryParseJSON(text || '');
    if (parsed && parsed.follow_up) return res.json({ follow_up: parsed.follow_up });

    const lines = (text || '').split(/\n/).map(l => l.trim()).filter(Boolean).slice(0, maxFollowups);
    return res.json({ follow_up: lines });
  } catch (err) {
    console.error('generate-followup error:', err?.response?.data || err?.message || err);
    return res.status(500).json({ error: 'LLM error', details: err?.message || err });
  }
});

app.post('/summarize', async (req, res) => {
  const { messages = [], contextSummary = '' } = req.body || {};
  if (!messages || messages.length === 0) return res.status(400).json({ error: 'missing messages' });

  const system = `You are a concise journaling summarizer. Output JSON only with keys: summary (1-3 sentences), takeaways (array), mood (1-10), moodReason (short).`;

  const convoText = messages.map(m => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.text}`).join('\n');

  const user = `Conversation:
"""${convoText}"""
Context: """${contextSummary}"""
Return JSON with summary, takeaways, mood, moodReason.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.3,
      max_tokens: 300
    });

    const choice = response.choices && response.choices[0];
    const text = choice?.message?.content ?? null;
    const parsed = tryParseJSON(text || '');
    if (parsed && parsed.summary) return res.json(parsed);
    return res.json({ summary: text || '', takeaways: [], mood: null, moodReason: '' });
  } catch (err) {
    console.error('summarize error:', err?.response?.data || err?.message || err);
    return res.status(500).json({ error: 'LLM error', details: err?.message || err });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));