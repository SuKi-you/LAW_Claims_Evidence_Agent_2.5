# 架构说明

## 前端状态流

```
discovery          confirmation        evidence
  │                    │                  │
  │  用户输入案情       │  用户勾选/排除    │  展示证据清单
  │  ↓                 │  诉求卡片         │  ↓
  │  CaseFacts 提取    │  ↓               │  核心证据
  │  ↓                 │  点击"确认诉求"    │  辅助证据
  │  Intent API 调用   │  ↓               │  风险提示
  │  ↓                 │  Evidence API    │
  │  Claim Guard 守卫  │  调用            │
  │  ↓                 │  ↓               │
  │  候选诉求卡片展示   │  Evidence Guard  │
  │                    │  守卫            │
  │                    │  ↓               │
  │                    │  渲染证据清单     │
```

三步状态机由 `currentStep` 控制：`"discovery"` → `"confirmation"` → `"evidence"`。

---

## 核心模块

### CaseFacts（`src/agent25/caseFacts.ts`）

纯正则提取，不依赖 LLM。从用户输入中提取 11 个布尔/unknown 字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `wantsDivorce` | `boolean` | 是否明确表达离婚意愿 |
| `hasChild` | `boolean \| "unknown"` | 是否有未成年子女 |
| `hasNoChild` | `boolean` | 是否明确表示无子女 |
| `hasCommonProperty` | `boolean \| "unknown"` | 是否有共同财产 |
| `hasNoCommonProperty` | `boolean` | 是否明确表示无共同财产 |
| `hasThirdPartyTransfer` | `boolean` | 是否涉及第三者转账 |
| `hasDomesticViolence` | `boolean` | 是否涉及家暴 |
| `hasNoDomesticViolence` | `boolean` | 是否明确表示无家暴 |
| `hasMildPushOnly` | `boolean` | 是否仅轻微推搡 |
| `noInjury` | `boolean` | 是否未受伤 |
| `noPolice` | `boolean` | 是否未报警 |

这些字段是 Claim Guard 和 Evidence Guard 的事实基础。

---

### Intent Workflow（诉求识别）

**端点**：`POST /v1/chat-messages`（Dify Chatflow）

**请求体**（由 Vite 代理转发）：
```json
{
  "inputs": {},
  "query": "用户原始案情文本",
  "response_mode": "blocking",
  "user": "demo-user"
}
```

**响应**经过 `adaptDifyIntentResponse()` 归一化为：
```typescript
{
  candidate_claims: AdaptedIntentClaim[]
  excluded_claims: { claim_name: string; reason: string }[]
  missing_info: string[]
}
```

---

### Claim Guard（`src/agent25/claimGuard.ts`）

`buildGuardedClaimCards()` 是纯函数，对 Dify 返回的候选诉求做三层处理：

**1. 过滤层（规则 1-2）**
- 无子女 → 排除子女抚养权/抚养费/探望权
- 无共同财产且无第三者转账 → 排除财产分割

**2. 调权层（规则 A-J）**
- 明确离婚意图 → 升级为"明确诉求"
- 未报警的家暴 → 降级为"可能涉及"
- 轻微推搡且未受伤未报警 → 降级家暴保护 + 离婚损害赔偿
- 有子女但未明确争夺抚养权 → 降级
- 第三者转账存在时财产分割 → 降为"待确认"

**3. 补充层（规则 K + 文字兜底）**
- 明确离婚但 Dify 未返回 → 补充离婚卡片
- 原文含家暴关键词但 Dify 未返回 → 补充家暴卡片
- 原文含转账关键词但 Dify 未返回 → 补充追回第三者赠与/财产转移

**4. 收敛层（isSimpleDivorceOnly）**
- 仅表达离婚意愿、无子女/财产/家暴/转账等事实 → 只保留离婚卡片

---

### Evidence Workflow（证据清单生成）

**端点**：`POST /v1/chat-messages`（Dify Chatflow）

**请求体**（由 Vite 代理转发）：
```json
{
  "inputs": {
    "query": "用户原始案情文本",
    "confirmed_claims": "[\"离婚\"]"
  },
  "query": "用户原始案情文本",
  "response_mode": "blocking",
  "user": "demo-user"
}
```

关键设计：
- `confirmed_claims` 是 `JSON.stringify(string[])` 的结果，不是逗号拼接
- `query` 是用户原始输入，不是经过清理/结构化的中间结果
- 每次请求创建新 conversation（不传 `conversation_id`），避免缓存干扰

**响应**经过 `adaptDifyEvidenceResponse()` 归一化为：
```typescript
{
  core_evidence: FinalEvidenceItem[]
  auxiliary_evidence: FinalEvidenceItem[]
  risk_tips: string[]
  legal_analysis?: ...
  missing_information?: string[]
  case_type?: string
}
```

---

### Evidence Guard（`src/agent25/evidenceGuard.ts`）

`buildGuardedEvidenceResult()` 根据确认的诉求类型过滤 Dify 返回的证据：

- 仅确认离婚 → 只保留基础证件 + 感情破裂相关，排除财产/家暴/子女/损害赔偿证据
- 确认财产类诉求 → 保留转账记录/银行流水/财产凭证
- 确认家暴保护 → 保留伤情照片/威胁记录/保护令材料
- 确认损害赔偿 → 保留医疗票据/精神损害材料
- 确认子女类 → 保留出生证明/抚养费/探望权材料

同时做去重 + 上限控制（core ≤ 8, auxiliary ≤ 5）。

---

### 本地兜底（`src/agent25/localFallback.ts`）

当 Dify API 不可用时，基于 CaseFacts + 正则文本匹配生成诉求和证据：
- `buildLocalIntentFallback()` → 保守的候选诉求
- `buildLocalEvidenceFallback()` → 基础的证据清单

---

### Dify Adapter（`src/agent25/difyAdapter.ts`）

归一化层，兼容 Dify 多种响应格式：
- `answer` 字段（chatflow 标准响应）
- `data.outputs`（旧版 workflow 格式）
- JSON 被包裹在 markdown code fence 中
- 字段名变体（`claim_name` / `claim` / `name` 等）

---

## 为什么 confirmed_claims 是唯一证据范围入口

1. **用户控制权优先** — 用户选择的主张才是真正需要准备证据的诉求
2. **防止证据越界** — 即使用户原文提到了其他事实，只要没确认对应诉求，就不应展示该类证据
3. **律师工作流模拟** — 律师在准备证据时，也是围绕客户明确委托的诉求展开，而非泛泛收集所有可能相关的材料

具体实现：Evidence Guard 的 `isAllowedEvidence()` 检查每条证据是否属于已确认的诉求类型，不属于的直接过滤。

---

## 前端代理（`vite.config.ts`）

两个 Vite 中间件：

| 路由 | Dify App | 端点 | 请求体关键差异 |
|------|----------|------|---------------|
| `/api/intent` | Intent Discovery (Chatflow) | `/v1/chat-messages` | `query` 在顶层 |
| `/api/analysis` | Evidence (Chatflow) | `/v1/chat-messages` | `confirmed_claims` 以 JSON 字符串传入 `inputs` |

API Key 在服务端通过 `loadEnv()` 读取，不暴露到浏览器。
