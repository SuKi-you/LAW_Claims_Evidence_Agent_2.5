import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import type { Plugin } from "vite"
import type { IncomingMessage } from "node:http"

function parseDifyAnswer(answer: string): unknown {
  let text = (answer || "").trim()
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "")
  }
  try {
    return JSON.parse(text)
  } catch {
    return { raw_text: answer }
  }
}

function getBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ""
    req.on("data", (chunk: Buffer) => { body += chunk.toString() })
    req.on("end", () => resolve(body))
  })
}

function difyProxyPlugin(): Plugin {
  return {
    name: "dify-proxy",
    configureServer(server) {
      const env = loadEnv("", path.resolve(process.cwd()), "")

      const difyBaseUrl = env.DIFY_API_BASE_URL || "http://localhost/v1"
      const intentApiKey = env.DIFY_INTENT_API_KEY
      const evidenceApiKey = env.DIFY_EVIDENCE_API_KEY

      if (!intentApiKey || !evidenceApiKey) {
        console.warn("[dify-proxy] ⚠️  DIFY_API keys missing in .env")
      }

      const setCorsHeaders = (res: any) => {
        res.setHeader("Access-Control-Allow-Origin", "*")
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
        res.setHeader("Access-Control-Allow-Headers", "Content-Type")
      }

      const handleOptions = (req: any, res: any): boolean => {
        if (req.method === "OPTIONS") {
          res.statusCode = 200
          res.end()
          return true
        }
        return false
      }

      const rejectMissingKey = (res: any, apiKey: string | undefined): boolean => {
        if (!apiKey) {
          res.statusCode = 500
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ error: "缺少 API Key，请在 .env 中配置" }))
          return true
        }
        return false
      }

      // ── Intent Discovery: chatflow → /v1/chat-messages ──
      server.middlewares.use("/api/intent", async (req, res) => {
        console.log("[dify-proxy] /api/intent ← frontend called Intent Discovery App")
        setCorsHeaders(res)
        if (handleOptions(req, res)) return
        if (rejectMissingKey(res, intentApiKey)) return

        try {
          const rawBody = await getBody(req)
          const parsed = JSON.parse(rawBody || "{}")
          const query: string = typeof parsed.query === "string" ? parsed.query : String(parsed.query || "")
          const user = parsed.user || "demo-user"

          console.log("[dify-proxy] parsed query:", String(query).slice(0, 200))

          if (!query) {
            res.statusCode = 400
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ error: "query 不能为空" }))
            return
          }

          const difyBody = { inputs: {}, query, response_mode: "blocking", user }
          const difyUrl = `${difyBaseUrl}/chat-messages`
          console.log(`[dify-proxy] → ${difyUrl}`)

          const response = await fetch(difyUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${intentApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(difyBody),
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`[dify-proxy] Intent error: status=${response.status}, body=${errorText}`)
            res.statusCode = response.status
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ error: `Dify API 返回错误 (${response.status})`, detail: errorText }))
            return
          }

          const data = await response.json() as Record<string, any>
          let rawAnswer = data.answer || ""
          const parsedAnswer = parseDifyAnswer(rawAnswer)
          console.log("[dify-proxy] intent parsed keys:", Object.keys(parsedAnswer as object))

          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ result: parsedAnswer, conversation_id: data.conversation_id }))
        } catch (err) {
          console.error("[dify-proxy] intent internal error:", err)
          res.statusCode = 500
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ error: "代理服务器内部错误", detail: String(err) }))
        }
      })

      // ── Evidence: chatflow → /v1/chat-messages ──
      server.middlewares.use("/api/analysis", async (req, res) => {
        console.log("[dify-proxy] /api/analysis ← frontend called Evidence Chatflow")
        setCorsHeaders(res)
        if (handleOptions(req, res)) return
        if (rejectMissingKey(res, evidenceApiKey)) return

        try {
          const rawBody = await getBody(req)
          const parsed = JSON.parse(rawBody || "{}")
          const query: string = typeof parsed.query === "string" ? parsed.query : String(parsed.query || "")
          const confirmed_claims = parsed.confirmed_claims || (parsed.inputs && parsed.inputs.confirmed_claims)
          const user = parsed.user || "demo-user"

          console.log("[dify-proxy] evidence query:", String(query).slice(0, 200))
          console.log("[dify-proxy] evidence confirmed_claims:", confirmed_claims)

          if (!query) {
            res.statusCode = 400
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ error: "query 不能为空" }))
            return
          }

          const inputs: Record<string, any> = { query }

          if (Array.isArray(confirmed_claims)) {
            inputs.confirmed_claims = JSON.stringify(confirmed_claims)
          } else if (typeof confirmed_claims === "string" && confirmed_claims.trim()) {
            inputs.confirmed_claims = confirmed_claims.trim()
          }

          const difyBody = { inputs, query, response_mode: "blocking", user }
          const difyUrl = `${difyBaseUrl}/chat-messages`
          console.log(`[dify-proxy] → ${difyUrl}`)
          console.log(`[dify-proxy] evidence request body:`, JSON.stringify(difyBody))

          const response = await fetch(difyUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${evidenceApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(difyBody),
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`[dify-proxy] Evidence error: status=${response.status}, body=${errorText}`)
            res.statusCode = response.status
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ error: `Dify API 返回错误 (${response.status})`, detail: errorText }))
            return
          }

          const data = await response.json() as Record<string, any>
          console.log("[dify-proxy] === Evidence Raw Response ===")
          console.log("[dify-proxy] full keys:", Object.keys(data))
          console.log("[dify-proxy] data.answer preview:", String(data.answer || "").slice(0, 500))

          let rawAnswer = data.answer || ""
          const parsedAnswer = parseDifyAnswer(rawAnswer)
          console.log("[dify-proxy] evidence parsed keys:", Object.keys(parsedAnswer as object))

          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ result: parsedAnswer, conversation_id: data.conversation_id }))
        } catch (err) {
          console.error("[dify-proxy] evidence internal error:", err)
          res.statusCode = 500
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ error: "代理服务器内部错误", detail: String(err) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), difyProxyPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
