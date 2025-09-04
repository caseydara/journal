// server/index.js
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { fetchAccessToken } = require('hume');

const app = express();

/* ------------------------ CORS (whitelist) ------------------------ */
/**
 * Allow localhost during development and your deployed frontend(s).
 * You can also set FRONTEND_ORIGINS in your env as a comma-separated list.
 * Example: FRONTEND_ORIGINS=https://your-frontend.onrender.com,https://your-domain.com
 */
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

if (process.env.FRONTEND_ORIGINS) {
  process.env.FRONTEND_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((o) => allowedOrigins.add(o));
}

// Helpful on Render/behind proxies when you later add cookies/etc.
app.set('trust proxy', 1);

const corsOptions = {
  origin(origin, cb) {
    // Allow requests with no Origin header (curl, server-to-server)
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  // credentials: true, // enable only if you need cookies/authorization headers cross-site
};

app.use(cors(corsOptions));
// Express 5: use a regex instead of '*' to avoid path-to-regexp error
app.options(/.*/, cors(corsOptions));

/* ------------------------ Body parsing & logging ------------------------ */
app.use(bodyParser.json({ limit: '1mb' }));

const LOG_PATH = path.join(__dirname, 'requests.log');
function logToFile(obj) {
  try {
    fs.appendFileSync(
      LOG_PATH,
      `${new Date().toISOString()} ${JSON.stringify(obj)}\n`
    );
  } catch (e) {
    console.error('logToFile error', e);
  }
}

/* ---------------- OpenAI client (existing) ---------------- */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function tryParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = (text || '').match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {}
    }
    return null;
  }
}

/* ---------------- Health check ---------------- */
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'journal-server',
    time: new Date().toISOString(),
    allowedOrigins: Array.from(allowedOrigins),
  });
});

/* --------------- /generate-followup (Hume optional, OpenAI fallback) --------------- */
app.post('/generate-followup', async (req, res) => {
  const {
    latestReply,
    contextSummary = '',
    maxFollowups = 3,
    moods = [],
  } = req.body || {};
  logToFile({ route: '/generate-followup', body: req.body });
  if (!latestReply)
    return res.status(400).json({ error: 'missing latestReply' });

  const useHume =
    String(process.env.USE_HUME_FOR_FOLLOWUPS || '').trim() === '1';
  const humeConfigId =
    process.env.HUME_CONFIG_ID || process.env.NEXT_PUBLIC_HUME_CONFIG_ID;

  const system =
    `You are a private, empathetic journaling companion whose goal is to make daily self-reflection simple, consistent, and insightful. ` +
    `Use a warm, nonjudgmental, conversational tone. Produce 2–3 short, open-ended follow-up questions that invite reflection, clarify feelings, or suggest small next steps. ` +
    `Return JSON only in the form {"follow_up": ["...","..."]}. Keep questions under 12 words when possible. Do not add any commentary outside the JSON.`;

  const moodText =
    Array.isArray(moods) && moods.length
      ? `User-reported moods: ${moods.join(', ')}.`
      : 'No explicit user-reported moods.';

  const user = `
Latest reply: """${latestReply}"""
${moodText}
Context: """${contextSummary}"""

Now produce up to ${maxFollowups} short, empathetic, conversational follow-up questions (JSON only).
`;

  if (useHume) {
    try {
      // Placeholder: if you add a server-side Hume call, invoke it here.
      logToFile({
        route: '/generate-followup',
        note: 'USE_HUME_FOR_FOLLOWUPS enabled but server-side Hume call not implemented; falling back to OpenAI.',
        humeConfigId,
      });
    } catch (humeErr) {
      console.warn(
        'Hume attempt failed, falling back to OpenAI:',
        humeErr?.message || humeErr
      );
      logToFile({
        route: '/generate-followup',
        humeError: String(humeErr),
      });
    }
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.6,
      max_tokens: 200,
    });

    const choice = response.choices && response.choices[0];
    const text =
      choice?.message?.content ??
      (typeof choice === 'string' ? choice : null);
    logToFile({ route: '/generate-followup', llmResponse: text });

    let parsed = tryParseJSON(text || '');
    if (!parsed) {
      const jsonMatch = (text || '').match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch (_) {
          parsed = null;
        }
      }
    }

    if (parsed && Array.isArray(parsed.follow_up)) {
      const filtered = parsed.follow_up
        .map((s) => s.trim())
        .filter((s) => s && !/tell me more about that/i.test(s))
        .slice(0, maxFollowups);
      if (filtered.length) return res.json({ follow_up: filtered });
    }

    const lines = (text || '')
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, maxFollowups);
    if (lines.length) return res.json({ follow_up: lines });

    return res.json({
      follow_up: [
        'How did that make you feel?',
        'What feels most important about this?',
        'Is there a small next step?',
      ].slice(0, maxFollowups),
    });
  } catch (err) {
    console.error(
      'generate-followup error:',
      err?.response?.data || err?.message || err
    );
    logToFile({ route: '/generate-followup', error: err?.message || err });
    return res
      .status(500)
      .json({ error: 'LLM error', details: err?.message || err });
  }
});

/* --------------- summarization route --------------- */
app.post('/summarize', async (req, res) => {
  const { messages = [], contextSummary = '' } = req.body || {};
  logToFile({ route: '/summarize', body: req.body });
  if (!messages || messages.length === 0)
    return res.status(400).json({ error: 'missing messages' });

  const system =
    'You are a concise journaling summarizer. Output JSON only with keys: summary (1-3 sentences), takeaways (array), mood (1-10), moodReason (short).';

  const convoText = messages
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.text}`)
    .join('\n');

  const user = `Conversation:
"""${convoText}"""
Context: """${contextSummary}"""
Return JSON with summary, takeaways, mood, moodReason.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const choice = response.choices && response.choices[0];
    const text = choice?.message?.content ?? null;
    logToFile({ route: '/summarize', llmResponse: text });

    const parsed = tryParseJSON(text || '');
    if (parsed && parsed.summary) {
      const out = {
        summary: parsed.summary,
        takeaways: Array.isArray(parsed.takeaways)
          ? parsed.takeaways
          : parsed.takeaways
          ? [parsed.takeaways]
          : [],
        mood:
          typeof parsed.mood === 'number'
            ? parsed.mood
            : parsed.mood
            ? Number(parsed.mood) || null
            : null,
        moodReason: parsed.moodReason || '',
        tags: Array.isArray(parsed.tags)
          ? parsed.tags
          : parsed.tags
          ? [parsed.tags]
          : [],
      };
      return res.json(out);
    }

    const simpleSummary = convoText
      .split('\n')
      .slice(-3)
      .map((s) => s.replace(/^(User:|Assistant:)\s*/, ''))
      .join(' — ');

    return res.json({
      summary: simpleSummary,
      takeaways: [],
      mood: null,
      moodReason: '',
    });
  } catch (err) {
    console.error(
      'summarize error:',
      err?.response?.data || err?.message || err
    );
    logToFile({ route: '/summarize', error: err?.message || err });
    return res
      .status(500)
      .json({ error: 'LLM error', details: err?.message || err });
  }
});

/* ---------------- Hume token endpoint ---------------- */
app.get('/hume-token', async (_req, res) => {
  try {
    const apiKey = process.env.HUME_API_KEY;
    const secretKey = process.env.HUME_SECRET_KEY;
    if (!apiKey || !secretKey) {
      return res
        .status(500)
        .json({ error: 'Hume API key/secret not configured' });
    }
    const accessToken = await fetchAccessToken({
      apiKey: String(apiKey),
      secretKey: String(secretKey),
    });
    return res.json({ accessToken });
  } catch (err) {
    console.error('Failed to fetch Hume access token', err);
    return res
      .status(500)
      .json({ error: 'token_error', details: err.message || String(err) });
  }
});

/* ---------------- Optional demo TTS endpoint ---------------- */
app.post('/tts-demo', (_req, res) => {
  const demoPath = path.join(__dirname, 'demo_tts_placeholder.wav');
  if (fs.existsSync(demoPath)) {
    res.setHeader('Content-Type', 'audio/wav');
    fs.createReadStream(demoPath).pipe(res);
  } else {
    res.status(404).json({ error: 'demo audio not found' });
  }
});

/* ---------------- Start server ---------------- */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
