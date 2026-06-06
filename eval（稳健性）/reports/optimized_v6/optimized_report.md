# Agent 2.5 optimized_v6 Eval Report

- Total cases: 30
- Overall pass rate: 56.7%
- Average score: 81.7
- Intent pass rate: 86.7%
- Evidence scope pass rate: 100.0%
- JSON schema pass rate: 90.0%
- Query cleaner observed: 0
- Retrieval observed: 0

## Core Metrics
- core_case_count: 28
- core_overall_pass_rate: 60.7%
- core_average_score: 83.3

## Optional Expansion Metrics
- optional_case_count: 2
- optional_overall_pass_rate: 0.0%
- optional_average_score: 59.5

## Warnings
- None

## Failed Cases
- G001 intent_and_evidence_single_claim: score 65, modules evidence_keywords, risk_tips; missing evidence directions: 身份证, 结婚证|婚姻登记, 感情破裂|分居|沟通记录; missing risk directions: 冷静期|三十日|30天, 感情破裂, 对方不同意|诉讼离婚; confirmed_claims present but evidence lists are empty
- G007 intent_and_evidence_single_claim: score 65, modules evidence_keywords, risk_tips; missing evidence directions: 转账记录|微信转账|支付宝转账, 银行流水|账户流水, 第三者身份|小三身份, 赠与目的|特殊金额|聊天记录, 异常转账时间线|时间线; missing risk directions: 赠与性质, 公序良俗, 夫妻共同财产, 第三者身份; confirmed_claims present but evidence lists are empty
- G008 intent_and_evidence_single_claim: score 65, modules evidence_keywords, risk_tips; missing evidence directions: 保护令申请书|人身安全保护令, 威胁聊天记录|威胁记录|录音录像, 当事人陈述|事实经过; missing risk directions: 安全风险, 及时报警|报警留痕, 保护令, 证据留存; confirmed_claims present but evidence lists are empty
- G010 intent_and_evidence_single_claim: score 74, modules intent; missing intent: 彩礼返还; missing evidence directions: 双方分开|解除关系
- G011 multi_fact_single_confirmed: score 65, modules evidence_keywords, risk_tips; missing evidence directions: 身份证, 结婚证|婚姻登记, 感情破裂|分居|沟通记录; missing risk directions: 冷静期|诉讼离婚, 感情破裂
- G015 multi_fact_single_confirmed: score 70, modules intent, json_schema; missing intent: 子女抚养权; valid JSON but missing final_evidence_list_for_user business schema
- G017 multi_claim_confirmed: score 65, modules evidence_keywords, risk_tips; missing evidence directions: 结婚证|婚姻登记, 出生证明|户口簿, 实际照顾, 收入证明, 教育支出|医疗支出; missing risk directions: 子女利益|最有利于未成年子女, 抚养费, 感情破裂|冷静期
- G020 negative_fact: score 55, modules evidence_keywords, json_schema, risk_tips; missing evidence directions: 身份证, 结婚证|婚姻登记, 感情破裂|分居|沟通记录; missing risk directions: 冷静期|三十日|30天, 感情破裂; valid JSON but missing final_evidence_list_for_user business schema
- G021 negative_fact: score 55, modules evidence_keywords, json_schema, risk_tips; missing evidence directions: 身份证, 结婚证|婚姻登记, 感情破裂|沟通记录; missing risk directions: 感情破裂, 诉讼离婚|不同意离婚, 冷静期; valid JSON but missing final_evidence_list_for_user business schema
- G023 negative_fact: score 65, modules evidence_keywords, risk_tips; missing evidence directions: 房产证|不动产登记, 购房合同|出资凭证, 财产清单; missing risk directions: 共同财产, 登记情况|出资情况, 财产线索; confirmed_claims present but evidence lists are empty
- G026 colloquial: score 45, modules intent, evidence_keywords, risk_tips; missing intent: 财产转移; missing evidence directions: 银行流水|账户流水, 异常转账|转账记录, 财产线索|藏钱线索; missing risk directions: 隐藏|转移, 及时固定证据, 财产保全; confirmed_claims present but evidence lists are empty
- G029 edge_weak_signal: score 65, modules evidence_keywords, risk_tips; missing evidence directions: 银行流水|银行存款|账户信息, 财产清单|财产线索, 结婚证|婚姻登记; missing risk directions: 财产线索, 账户, 共同财产, 法院调取; confirmed_claims present but evidence lists are empty
- G030 edge_weak_signal: score 45, modules intent, evidence_keywords, risk_tips; missing intent: 亲子关系确认/否认; missing evidence directions: 出生证明|出生医学证明, 亲子鉴定|鉴定申请, 血型|医学材料, 身份材料; missing risk directions: 亲子鉴定, 未成年子女利益|子女利益, 法院委托|鉴定; confirmed_claims present but evidence lists are empty

## Notes
- API keys are read from local env files but are not written into reports.
- query_cleaner and retrieval metrics are scored only when the Dify response exposes observable fields.