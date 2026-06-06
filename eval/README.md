# Evaluation

本目录用于把阶段一已经完成的离线 Eval 固化为阶段二 CI 自动化回归测试。

阶段二的目标不是重新设计 Eval、优化模型、修改 Dify workflow 或改前端业务逻辑，而是在每次 push / pull request 后自动运行已有 Golden Cases，防止代码、Prompt、Workflow 或 adapter 调用方式变化导致 Agent 2.5 的 Intent / Evidence 指标退化。

## Stage 1 Status

阶段一离线 Eval 已完成：

- Intent Eval：35 条 Golden Cases，对比 Agent 2.0 / 2.5 / 3.0。
- Evidence Eval：30 条 Golden Cases，对比 Agent 2.0 / 2.5 / 3.0。
- 已生成 CSV、Markdown 报告和图表产物。

仓库中原有的 `eval（稳健性）/` 目录保留为历史稳健性评估资料。本阶段 CI 使用标准路径 `eval/`。

## Directory Layout

```text
eval/
  cases/
    cases_intent_35.json
    cases_evidence_30.json
  scripts/
    run_intent_eval_v2.py
    run_evidence_eval.py
    check_eval_thresholds.py
  outputs/
    intent_eval_detail_v2.csv
    intent_eval_summary_v2.csv
    intent_eval_report_v2.md
    evidence_eval_detail.csv
    evidence_eval_summary.csv
    evidence_eval_report.md
  charts/
    intent_three_metrics_comparison_cn_pct.png
    evidence_three_metrics_comparison_cn_pct.png
    evidence_overall_pass_rate_cn_pct.png
```

## Current CI Mode

当前 CI 属于离线 adapter 回归测试：`agent20_adapter.py`、`agent25_adapter.py`、`agent30_adapter.py` 通过 stdin 接收 JSON payload，并输出 Intent 或 Evidence JSON。

当前脚本不调用 Dify API，因此不需要配置 GitHub Secrets，也不会读取真实 API Key。未来如果改为实时调用 Dify Agent，可在 workflow 中通过 secrets 注入：

- `DIFY_BASE_URL`
- `DIFY_INTENT_API_KEY`
- `DIFY_EVIDENCE_API_KEY`

不要把真实 key 写入仓库。

## Run Intent Eval Locally

```bash
python eval/scripts/run_intent_eval_v2.py \
  --cases eval/cases/cases_intent_35.json \
  --config eval/scripts/eval_agents_config.intent.json \
  --detail-csv eval/outputs/intent_eval_detail_v2.csv \
  --summary-csv eval/outputs/intent_eval_summary_v2.csv \
  --summary-md eval/outputs/intent_eval_report_v2.md
```

输出：

- `eval/outputs/intent_eval_detail_v2.csv`
- `eval/outputs/intent_eval_summary_v2.csv`
- `eval/outputs/intent_eval_report_v2.md`

## Run Evidence Eval Locally

```bash
python eval/scripts/run_evidence_eval.py \
  --cases eval/cases/cases_evidence_30.json \
  --config eval/scripts/eval_agents_config.evidence.json \
  --detail-csv eval/outputs/evidence_eval_detail.csv \
  --summary-csv eval/outputs/evidence_eval_summary.csv \
  --summary-md eval/outputs/evidence_eval_report.md
```

输出：

- `eval/outputs/evidence_eval_detail.csv`
- `eval/outputs/evidence_eval_summary.csv`
- `eval/outputs/evidence_eval_report.md`

## Generate Charts

```bash
python eval/scripts/generate_eval_charts.py
```

输出：

- `eval/charts/intent_three_metrics_comparison_cn_pct.png`
- `eval/charts/evidence_three_metrics_comparison_cn_pct.png`
- `eval/charts/evidence_overall_pass_rate_cn_pct.png`

图表脚本只使用 Python 标准库。

## Check Thresholds

```bash
python eval/scripts/check_eval_thresholds.py
```

`check_eval_thresholds.py` 会读取 summary CSV 的表头，优先匹配现有字段名。如果无法确认字段含义，会在终端输出实际表头并失败，提示需要人工确认字段名。

## Metrics

Intent：

- Core Recall：`expected_intent_claims` 是否被完全识别。
- Precision：输出诉求中有多少属于 expected intent claims。
- Robustness：`disallowed_high_confidence_intent_claims` 是否没有被高置信输出。
- Intent Score：`0.4 * Core Recall + 0.4 * Precision + 0.2 * Robustness`。

Evidence：

- Core Evidence Recall：`must_include` 中的证据是否被包含。
- Evidence Robustness：`must_not_include` 中的证据是否没有出现。
- Evidence Score：`0.5 * Core Evidence Recall + 0.5 * Evidence Robustness`。
- Overall Pass Rate：逐条 case 同时满足核心证据命中和稳健性的比例。

## Agent 2.5 Baseline

当前 Agent 2.5 baseline：

| Eval | Metric | Baseline |
|---|---:|---:|
| Intent | Core Recall | 100% |
| Intent | Precision | 87.14% |
| Intent | Robustness | 100% |
| Intent | Intent Score | 94.86% |
| Evidence | Core Evidence Recall | 100% |
| Evidence | Evidence Robustness | 100% |
| Evidence | Evidence Score | 100% |
| Evidence | Overall Pass Rate | 100% |

## Quality Gates

CI 会检查 Agent 2.5 的 summary 指标：

- Intent Core Recall 不能低于 100%。
- Intent Robustness 不能低于 100%。
- Intent Precision 不能明显低于 87.14%。
- Evidence Core Evidence Recall 不能低于 100%。
- Evidence Robustness 不能低于 100%。
- Evidence Score 不能低于 100%。
- Evidence Overall Pass Rate 不能低于 100%。

任一指标低于阈值，GitHub Actions 会失败。

## GitHub Actions

`.github/workflows/eval.yml` 在 `push` 和 `pull_request` 时触发，流程如下：

1. Checkout 代码。
2. 设置 Python 3.11。
3. 运行 Intent Eval。
4. 运行 Evidence Eval。
5. 生成 charts。
6. 运行 `check_eval_thresholds.py`。
7. 上传 `eval/outputs` 和 `eval/charts` 作为 artifacts。

## Scope

阶段二是 CI 回归测试，不是线上实时监控，也不是 LLM 监管 LLM。它的作用是把已定义的 Golden Cases 和 baseline 固化到工程流程里，让能力退化可以在 push / PR 阶段被及时发现。
