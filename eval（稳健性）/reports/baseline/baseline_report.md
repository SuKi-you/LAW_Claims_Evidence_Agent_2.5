# Agent 2.5 baseline Eval Report

- Total cases: 30
- Overall pass rate: 73.3%
- Average score: 87.2
- Intent pass rate: 70.0%
- Evidence scope pass rate: 100.0%
- JSON schema pass rate: 100.0%
- Query cleaner observed: 0
- Retrieval observed: 0

## 核心能力指标
- score_group: core
- Case count: 28
- Overall pass rate: 78.6%
- Average score: 88.2

## 扩展能力指标
- score_group: optional_expansion
- Case count: 2
- Overall pass rate: 0.0%
- Average score: 74.0

## Warnings
- None

## Failed Cases
- G003 intent_and_evidence_single_claim: score 70, modules evidence_keywords, risk_tips; missing evidence directions: 收入证明|工资|纳税|银行流水, 教育支出|学费, 医疗支出|医疗费, 生活费|日常生活支出; missing risk directions: 实际需要|生活水平, 收入, 教育费|医疗费|教育医疗
- G004 intent_and_evidence_single_claim: score 65, modules evidence_keywords, risk_tips; missing evidence directions: 出生证明|户口簿|亲子关系, 探望安排|探望计划, 沟通记录|协商记录; missing risk directions: 子女利益|最有利于未成年子女, 探望方式, 阻挠探望; confirmed_claims present but evidence lists are empty
- G006 intent_and_evidence_single_claim: score 45, modules intent, evidence_keywords, risk_tips; missing intent: 财产转移; missing evidence directions: 银行流水|账户流水|账户明细, 转账记录|异常转账, 夫妻共同财产凭证|共同财产, 财产线索|转移线索; missing risk directions: 隐藏|转移, 财产保全, 及时固定证据, 少分或者不分
- G010 intent_and_evidence_single_claim: score 74, modules intent; missing intent: 彩礼返还; missing evidence directions: 双方分开|解除关系
- G012 multi_fact_single_confirmed: score 74, modules intent; missing intent: 家暴 / 人身安全保护; missing evidence directions: 赠与目的|聊天记录
- G015 multi_fact_single_confirmed: score 74, modules intent; missing intent: 子女抚养权; missing evidence directions: 财产转移线索|财产线索
- G026 colloquial: score 62, modules intent, risk_tips; missing intent: 财产转移; missing evidence directions: 财产线索|藏钱线索; missing risk directions: 隐藏|转移, 及时固定证据, 财产保全
- G030 edge_weak_signal: score 74, modules intent; missing intent: 亲子关系确认/否认; missing evidence directions: 身份材料

## Notes
- API keys are read from local env files but are not written into reports.
- query_cleaner and retrieval metrics are scored only when the Dify response exposes observable fields.