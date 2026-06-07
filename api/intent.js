// Vercel Serverless Function: Intent Discovery proxy
// 代理 /api/intent → Dify Chatflow /chat-messages
export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

function parseDifyAnswer(answer) {
  let text = String(answer || "").trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw_text: answer };
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.VITE_DIFY_INTENT_API_KEY || process.env.DIFY_INTENT_API_KEY;
  const baseUrl = (process.env.VITE_DIFY_BASE_URL || process.env.DIFY_BASE_URL || "https://api.dify.ai/v1").replace(/\/+$/, "");

  if (!apiKey) {
    return res.status(500).json({ error: "缺少 Intent API Key" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const query = body.query || body.userInput || "";
  const user = body.user || "demo-user";

  if (!query) {
    return res.status(400).json({ error: "query 不能为空" });
  }

  const difyBody = { inputs: {}, query, response_mode: "blocking", user };
  const difyUrl = `${baseUrl}/chat-messages`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50_000);

    const difyRes = await fetch(difyUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(difyBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!difyRes.ok) {
      const errorText = await difyRes.text();
      return res.status(difyRes.status).json({
        error: `Dify API 返回错误 (${difyRes.status})`,
        detail: errorText,
      });
    }

    const data = await difyRes.json();
    const parsedAnswer = parseDifyAnswer(data.answer || "");

    return res.status(200).json({
      result: parsedAnswer,
      conversation_id: data.conversation_id,
    });
  } catch (err) {
    return res.status(500).json({
      error: "代理服务器内部错误",
      detail: String(err),
    });
  }
}
