export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET;
  if (!url || !key) return res.status(500).json({ error: "Supabase not configured" });

  try {
    const { email, source } = req.body || {};

    // basic email validation
    if (!email || typeof email !== "string" || !email.includes("@") || email.length > 200) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const response = await fetch(`${url}/rest/v1/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        source: (source || "gate").slice(0, 40),
      }),
    });

    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      console.error("Supabase insert error:", response.status, txt);
      return res.status(502).json({ error: "Could not save" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Lead endpoint error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
