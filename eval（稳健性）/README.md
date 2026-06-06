# Agent 2.5 Golden Eval v1

本目录用于运行 Agent 2.5 的 golden baseline 评测。脚本只调用现有 Dify App，不修改 prompt、workflow 或前端业务逻辑。

## 文件说明

- `cases.json`：人工设计的 30 条 golden cases，当前版本为 `agent25_golden_v1`。
- `run-eval.js`：批量调用 Intent App 与 Evidence App，保存原始响应、解析结果、评分结果、Excel、PNG 图表和 Markdown 报告。
- `score.js`：按 Golden Eval v1 评分。`core` 指标计入总分，query cleaner / retrieval 只在可观测时作为参考。
- `charts.js`：生成 PNG 图表。
- `reports/`：评测输出目录。

## 环境变量

脚本从项目根目录的 `.env.test.local` 优先读取，必要时回退 `.env`。需要：

- `DIFY_API_BASE_URL`
- `DIFY_INTENT_API_KEY`
- `DIFY_EVIDENCE_API_KEY`

可选：

- `VITE_DIFY_INTENT_TIMEOUT_MS`
- `VITE_DIFY_EVIDENCE_TIMEOUT_MS`

API Key 只用于本地请求，脚本会在报告写入前脱敏。

## 运行

```bash
npm run eval:smoke
npm run eval:baseline
```

也可以直接运行：

```bash
node eval/run-eval.js --version smoke --limit 5
node eval/run-eval.js --version baseline
```

## 评分口径

总分 100：

- Intent 命中：20
- Excluded claims：10
- Evidence 必要证据覆盖：25
- Evidence 不越界：25
- JSON schema：10
- Risk tips：10

`overall_pass = total_score >= 80 && evidence_scope_pass === true && json_schema_pass === true`。

`evidence_expectation.allowed_include` 只表示允许出现，不加分也不扣分。`optional_expansion`、query cleaner、retrieval 相关观测不纳入主评分。
