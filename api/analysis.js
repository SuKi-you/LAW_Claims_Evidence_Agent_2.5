// Vercel Serverless Function: Evidence proxy
// 代理 /api/analysis → Dify Chatflow /chat-messages
export const config = {
  runtime: "nodejs20.x",
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

  const apiKey = process.env.VITE_DIFY_EVIDENCE_API_KEY || process.env.DIFY_EVIDENCE_API_KEY;
  const baseUrl = (process.env.VITE_DIFY_BASE_URL || process.env.DIFY_BASE_URL || "https://api.dify.ai/v1").replace(/\/+$/, "");

  if (!apiKey) {
    return res.status(500).json({ error: "缺少 Evidence API Key" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const query = body.query || body.userInput || "";
  const user = body.user || "demo-user";

  if (!query) {
    return res.status(400).json({ error: "query 不能为空" });
  }

  // 兼容两种格式：顶层 confirmed_claims 或 inputs.confirmed_claims
  let confirmedClaims = body.confirmed_claims;
  if (confirmedClaims === undefined && body.inputs) {
    confirmedClaims = body.inputs.confirmed_claims;
  }

  const inputs = { query };
  if (Array.isArray(confirmedClaims) && confirmedClaims.length > 0) {
    inputs.confirmed_claims = JSON.stringify(confirmedClaims);
  } else if (typeof confirmedClaims === "string" && confirmedClaims.trim()) {
    inputs.confirmed_claims = confirmedClaims.trim();
  }

  const difyBody = { inputs, query, response_mode: "blocking", user };
  const difyUrl = `${baseUrl}/chat-messages`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 65_000);

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
