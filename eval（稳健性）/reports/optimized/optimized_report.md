# Agent 2.5 optimized Eval Report

- Total cases: 30
- Overall pass rate: 76.7%
- Average score: 88.6
- Intent pass rate: 86.7%
- Evidence scope pass rate: 100.0%
- JSON schema pass rate: 100.0%
- Query cleaner observed: 0
- Retrieval observed: 0

## Core Metrics
- score_group: core
- Case count: 28
- Overall pass rate: 82.1%
- Average score: 89.7

## Optional Expansion Metrics
- score_group: optional_expansion
- Case count: 2
- Overall pass rate: 0.0%
- Average score: 74.0

## Warnings
- None

## Failed Cases
- G005 intent_and_evidence_single_claim: score 65, modules evidence_keywords, risk_tips; missing evidence directions: 房产证|不动产登记, 购房合同|出资凭证, 车辆登记|车辆登记证, 财产清单, 银行流水|银行存款; missing risk directions: 共同财产, 财产线索, 登记情况|出资情况, 债务; confirmed_claims present but evidence lists are empty
- G007 intent_and_evidence_single_claim: score 65, modules evidence_keywords, risk_tips; missing evidence directions: 转账记录|微信转账|支付宝转账, 银行流水|账户流水, 第三者身份|小三身份, 赠与目的|特殊金额|聊天记录, 异常转账时间线|时间线; missing risk directions: 赠与性质, 公序良俗, 夫妻共同财产, 第三者身份; confirmed_claims present but evidence lists are empty
- G010 intent_and_evidence_single_claim: score 74, modules intent; missing intent: 彩礼返还; missing evidence directions: 双方分开|解除关系
- G013 multi_fact_single_confirmed: score 65, modules evidence_keywords, risk_tips; missing evidence directions: 保护令申请书|人身安全保护令, 伤情照片|就医记录|伤情, 威胁记录|聊天记录|录音录像, 当事人陈述; missing risk directions: 人身安全, 保护令, 报警留痕|及时报警; confirmed_claims present but evidence lists are empty
- G014 multi_fact_single_confirmed: score 65, modules evidence_keywords, risk_tips; missing evidence directions: 出生证明|户口簿, 实际照顾|长期照顾, 收入证明|经济能力, 居住条件; missing risk directions: 最有利于未成年子女|子女利益, 稳定照顾|长期照顾; confirmed_claims present but evidence lists are empty
- G018 multi_claim_confirmed: score 65, modules evidence_keywords, risk_tips; missing evidence directions: 结婚证|婚姻登记, 感情破裂|家暴事实, 保护令申请书|人身安全保护令, 伤情照片|就医记录|威胁记录, 当事人陈述; missing risk directions: 人身安全, 保护令, 及时报警|安全风险, 感情破裂; confirmed_claims present but evidence lists are empty
- G030 edge_weak_signal: score 74, modules intent; missing intent: 亲子关系确认/否认; missing evidence directions: 身份材料

## Notes
- API keys are read from local env files but are not written into reports.
- query_cleaner and retrieval metrics are scored only when the Dify response exposes observable fields.