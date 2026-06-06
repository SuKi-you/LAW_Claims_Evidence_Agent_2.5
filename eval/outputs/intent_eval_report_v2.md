# Agent Intent Golden Cases 评估报告

本报告只评估 Intent 层，不评估 Evidence、Risk、RAG 或 JSON Schema。

## 指标说明

- Core Recall：核心诉求召回率，衡量该识别的诉求有没有识别出来。
- Precision：诉求精确率，衡量输出诉求中有多少是 expected_intent_claims。
- Robustness：高置信稳健性，衡量不该高置信输出的诉求有没有被高置信乱输出。
- Intent Score：0.4 × Core Recall + 0.4 × Precision + 0.2 × Robustness。

## 版本汇总

| Agent 版本 | Case 数 | Core Recall | Precision | Robustness | Intent Score | 平均额外诉求数 | 平均高置信违规数 | 整体通过率 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2.0 | 35 | 1.0 | 0.6333 | 0.6929 | 0.7919 | 1.0 | 0.5714 | 0.3429 |
| 2.5 | 35 | 1.0 | 0.8714 | 1.0 | 0.9486 | 0.2857 | 0.0 | 0.7429 |
| 3.0 | 35 | 1.0 | 0.8286 | 0.9286 | 0.9171 | 0.3714 | 0.0857 | 0.6571 |