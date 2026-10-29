/**
 * האקדמיה המיסטית — קליטת לידים
 *
 * שולח כל הרשמה למייל במקום לכתוב למסד נתונים.
 * הסיבה: פרויקט ה-Supabase הקודם נמחק אוטומטית בגלל חוסר פעילות
 * (ENOTFOUND bwcjuvlwpwjioqoqlvyg.supabase.co), וכל הלידים שנשלחו מאז אבדו.
 * שירות מייל לא נמחק על חוסר פעילות, ואם שליחה נכשלת — היא נרשמת בלוג של Vercel.
 *
 * משתני סביבה נדרשים:
 *   RESEND_API_KEY  — מפתח מ-resend.com
 *   LEAD_TO_EMAIL   — כתובת היעד שאליה יגיעו ההרשמות
 *   LEAD_FROM_EMAIL — אופציונלי. ברירת מחדל: onboarding@resend.dev
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.LEAD_TO_EMAIL;
  const from   = process.env.LEAD_FROM_EMAIL || "האקדמיה המיסטית <onboarding@resend.dev>";

  if (!apiKey || !to) {
    console.error("Lead: missing RESEND_API_KEY or LEAD_TO_EMAIL");
    return res.status(500).json({ error: "Mail not configured" });
  }

  try {
    const { email, source } = req.body || {};

    if (!email || typeof email !== "string" || !email.includes("@") || email.length > 200) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const clean = email.trim().toLowerCase();
    const src   = (source || "gate").slice(0, 40);
    const when  = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: clean,
        subject: `הרשמה חדשה — ${clean}`,
        text:
          `הרשמה חדשה באקדמיה המיסטית\n\n` +
          `אימייל: ${clean}\n` +
          `מקור:   ${src}\n` +
          `מתי:    ${when}\n\n` +
          `אפשר להשיב למייל הזה כדי לענות לנרשם ישירות.`,
      }),
    });

    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      // הליד עצמו נרשם בלוג כדי שלא יאבד גם אם השליחה נכשלה
      console.error("Lead: send failed", response.status, txt, "| LEAD:", clean, src, when);
      return res.status(502).json({ error: "Could not send" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    const fallback = (req.body && req.body.email) || "unknown";
    console.error("Lead endpoint error:", err, "| LEAD:", fallback);
    return res.status(500).json({ error: "Internal server error" });
  }
}
