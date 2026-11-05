/**
 * האקדמיה המיסטית — קריאה זורמת ל-AI
 *
 * מחזיר את תשובת Anthropic כזרם SSE במקום להמתין לטקסט המלא.
 * המשתמש רואה את המילים הראשונות אחרי שנייה-שתיים במקום להמתין
 * 25-40 שניות מול נקודות מקפצות.
 *
 * api/claude.mjs הישן נשאר על כנו בכוונה: הדפדפן נופל אליו אוטומטית
 * אם הזרימה נכשלת (סביבה שחוסמת SSE, פרוקסי שמאגר תשובות וכו').
 *
 * משתנה סביבה נדרש: ANTHROPIC_API_KEY
 */
const MODEL = "claude-sonnet-4-5";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  let messages, system, max_tokens;
  try {
    ({ messages, system, max_tokens = 1600 } = req.body || {});
  } catch (_) {
    return res.status(400).json({ error: "Bad request body" });
  }
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: "messages required" });
  }
  // תקרה קשיחה, כדי ששדה מהלקוח לא יוכל להזמין תשובה ענקית
  const cap = Math.min(Math.max(parseInt(max_tokens, 10) || 1600, 200), 2400);

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: cap, system, messages, stream: true }),
    });
  } catch (err) {
    console.error("Claude stream: upstream fetch failed", err);
    return res.status(502).json({ error: "Upstream unreachable" });
  }

  // כישלון לפני תחילת הזרימה — עדיין אפשר להחזיר JSON רגיל,
  // כך שהדפדפן יידע ליפול אחורה לנתיב הלא-זורם.
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("Claude stream: upstream error", upstream.status, detail.slice(0, 500));
    return res.status(upstream.status || 502).json({ error: "Claude API error" });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // מונע איגום (buffering) בשכבת הפרוקסי
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
      if (typeof res.flush === "function") res.flush();
    }
  } catch (err) {
    // הזרם נקטע באמצע. הכותרות כבר נשלחו, אז אין יותר אפשרות לקוד שגיאה —
    // משדרים אירוע שגיאה שהדפדפן יודע לזהות.
    console.error("Claude stream: interrupted", err);
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "stream interrupted" })}\n\n`);
    } catch (_) {}
  } finally {
    try { reader.cancel(); } catch (_) {}
    res.end();
  }
}
