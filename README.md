# LAW Claims Evidence Agent 2.5

面向婚姻家事场景的 AI 法律诉求识别与证据清单生成工具。帮助用户完成**初步事实整理 → 候选诉求识别 → 用户确认 → 证据清单生成**的信息结构化流程，降低去律所咨询前的信息准备门槛。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 7 |
| 样式 | Tailwind CSS v4 + shadcn/ui |
| AI 工作流 | Dify Chatflow × 2 |
| 诉求守卫 | 本地正则事实提取 + 确定性规则引擎 |
| 证据守卫 | 诉求类型匹配过滤 |

## 业务流程

```
用户输入案情
  → 本地 CaseFacts 正则提取（11 个布尔/unknown 字段）
  → [信息不足] → 本地引导追问
  → [信息充分] → Dify Intent Discovery App（诉求识别）
  → buildGuardedClaimCards() 守卫过滤/补足
  → 候选诉求卡片展示
  → 用户手动勾选确认诉求
  → Dify Evidence App（证据清单生成）
  → adaptDifyEvidenceResponse() 适配
  → buildGuardedEvidenceResult() 守卫过滤
  → 核心证据 / 辅助证据 / 风险提示 渲染
```

## Dify 双 App 架构

### Intent Discovery App（诉求识别 — Chatflow）

- 端点：`POST /v1/chat-messages`
- 接收用户原始案情文本
- 返回 `candidate_claims`、`excluded_claims`、`missing_info`
- 前端 `claimGuard` 对 LLM 返回结果做确定性过滤和补充
- 9 个标准诉求类型：离婚、子女抚养权、抚养费、探望权、财产分割、家暴 / 人身安全保护、离婚损害赔偿、追回第三者赠与、财产转移

### Evidence App（证据清单生成 — Chatflow）

- 端点：`POST /v1/chat-messages`
- 接收 `query`（原始案情）+ `inputs.confirmed_claims`（JSON 序列化的确认诉求数组）
- 返回 `final_evidence_list_for_user`（核心/辅助证据）+ `risk_tips`
- `confirmed_claims` 作为唯一证据范围入口，前端 `evidenceGuard` 按确认的诉求类型过滤

## 项目结构

```
├── src/
│   ├── agent25/           # Agent 2.5 核心逻辑
│   │   ├── caseFacts.ts      # 正则事实提取（11 字段）
│   │   ├── claimGuard.ts     # 诉求守卫（过滤/降级/补充）
│   │   ├── claimTypes.ts     # 诉求类型定义
│   │   ├── difyAdapter.ts    # Dify API 适配
│   │   ├── evidenceGuard.ts  # 证据守卫
│   │   └── localFallback.ts  # 本地兜底
│   ├── utils/             # 状态机 + 诉求检测
│   └── components/ui/     # shadcn/ui 组件
├── dify-workflows/        # Dify Chatflow YML（脱敏）
│   ├── intent-discovery-agent.yml
│   └── evidence-agent.yml
├── dify-knowledge/        # 知识库种子文档
├── eval/                  # 评测框架
│   ├── cases.json         # 30 个评测用例
│   ├── run-eval.js        # 评测执行
│   ├── score.js           # 评分逻辑
│   └── reports/           # 评测报告与图表
├── docs/                  # 架构文档 / Demo 脚本 / 回归测试报告
├── tests/                 # 测试用例 JSON
└── supabase/              # Supabase Edge Functions（可选后端）
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 Dify API 地址和两个 App 的 API Key

# 3. 启动开发服务器
npm run dev
# 访问 http://localhost:5173
```

### 环境变量

| 变量 | 说明 |
|------|------|
| `DIFY_API_BASE_URL` | Dify API 基础地址，例如 `https://your-dify-instance/v1` |
| `DIFY_INTENT_API_KEY` | Intent Discovery App 的 API Key |
| `DIFY_EVIDENCE_API_KEY` | Evidence App 的 API Key |

> API Key 存储在 `.env` 中，不会被提交到 Git。`.env.example` 仅包含占位符。

## 导入 Dify Workflow

`dify-workflows/` 目录下的 YML 文件可直接导入 Dify：

1. 在 Dify 中创建 Chatflow 应用
2. 点击「导入 DSL」
3. 上传对应的 YML 文件
4. 配置 Knowledge Retrieval 节点的知识库（替换 `<your-knowledge-base-dataset-id>`）
5. 配置模型供应商（deepseek + tongyi）

## 评测结果摘要

| 指标 | Baseline | Optimized |
|------|----------|-----------|
| 总用例数 | 40 | 30 |
| 整体通过率 | 27.5% | 56.7% |
| 平均得分 | 58.9 | 81.7 |
| Intent 通过率 | 72.5% | 86.7% |
| Evidence Scope 通过率 | 67.5% | 100.0% |
| JSON Schema 通过率 | 85.0% | 90.0% |

> 详细评测报告见 `eval/reports/comparison_v6/baseline_vs_optimized_v6.md`。

## 诉求守卫规则（claimGuard）

前端 `claimGuard` 基于 11 个正则提取的本地事实字段，对 LLM 返回的候选诉求做确定性过滤：

- **确定性排除**：用户明确说"没有孩子"→ 排除子女抚养权/抚养费/探望权
- **确定性补足**：用户提到"偷偷转走钱"→ 强制补入财产转移
- **冲突修正**：excluded_claims 中已排除的诉求不得出现在 candidate_claims 中

## 免责声明

本工具仅用于信息整理和初步参考，不构成正式法律意见。涉及具体法律问题，请咨询执业律师。

## License

MIT
