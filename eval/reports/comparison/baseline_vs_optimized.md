# Baseline vs Optimized Eval

## Run Scope
- Cases: G001-G030
- Optimized Intent App: legal-claim-evidence-agent-intent-2-5-light-optimized-v2
- Optimized Evidence App: legal-claim-evidence-agent-evidence-2-5-light-optimized-v5
- Endpoint: /v1/chat-messages
- response_mode: blocking
- conversation_id sent by eval script: false

## Metrics
| Metric | Baseline | Optimized | Delta |
|---|---:|---:|---:|
| overall_pass_rate | 73.3% | 76.7% | 3.3% |
| core_overall_pass_rate | 78.6% | 82.1% | 3.6% |
| optional_expansion_pass_rate | 0.0% | 0.0% | 0.0% |
| average_score | 87.2 | 88.6 | 1.4 |
| core_average_score | 88.2 | 89.7 | 1.5 |
| intent_pass_rate | 70.0% | 86.7% | 16.7% |
| excluded_claims_pass_rate | 100.0% | 100.0% | 0.0% |
| evidence_keywords_pass_rate | 86.7% | 76.7% | -10.0% |
| evidence_scope_pass_rate | 100.0% | 100.0% | 0.0% |
| json_schema_pass_rate | 100.0% | 100.0% | 0.0% |
| risk_tips_pass_rate | 80.0% | 83.3% | 3.3% |
| total_errors | 8.0 | 7.0 | -100.0% |
| average_latency_ms | 43410.6 | 43998.0 | 587.4 |

## Improved From Failed To Passed
- G003 (core, 抚养费): 70 -> 95
- G004 (core, 探望权): 65 -> 83
- G006 (core, 财产转移): 45 -> 100
- G012 (core, 追回第三者赠与): 74 -> 94
- G015 (core, 财产转移): 74 -> 80
- G026 (core, 财产转移): 62 -> 100

## Optimized Still Failed
- G005 (core, 财产分割): score 65, modules evidence_keywords; risk_tips, error_type empty_evidence_output; missing evidence directions: 房产证|不动产登记, 购房合同|出资凭证, 车辆登记|车辆登记证, 财产清单, 银行流水|银行存款; missing risk directions: 共同财产, 财产线索, 登记情况|出资情况, 债务; confirmed_claims present but evidence lists are empty
- G007 (core, 追回第三者赠与): score 65, modules evidence_keywords; risk_tips, error_type empty_evidence_output; missing evidence directions: 转账记录|微信转账|支付宝转账, 银行流水|账户流水, 第三者身份|小三身份, 赠与目的|特殊金额|聊天记录, 异常转账时间线|时间线; missing risk directions: 赠与性质, 公序良俗, 夫妻共同财产, 第三者身份; confirmed_claims present but evidence lists are empty
- G010 (optional_expansion, 彩礼返还): score 74, modules intent, error_type intent_miss; missing intent: 彩礼返还; missing evidence directions: 双方分开|解除关系
- G013 (core, 家暴 / 人身安全保护): score 65, modules evidence_keywords; risk_tips, error_type empty_evidence_output; missing evidence directions: 保护令申请书|人身安全保护令, 伤情照片|就医记录|伤情, 威胁记录|聊天记录|录音录像, 当事人陈述; missing risk directions: 人身安全, 保护令, 报警留痕|及时报警; confirmed_claims present but evidence lists are empty
- G014 (core, 子女抚养权): score 65, modules evidence_keywords; risk_tips, error_type empty_evidence_output; missing evidence directions: 出生证明|户口簿, 实际照顾|长期照顾, 收入证明|经济能力, 居住条件; missing risk directions: 最有利于未成年子女|子女利益, 稳定照顾|长期照顾; confirmed_claims present but evidence lists are empty
- G018 (core, 离婚; 家暴 / 人身安全保护): score 65, modules evidence_keywords; risk_tips, error_type empty_evidence_output; missing evidence directions: 结婚证|婚姻登记, 感情破裂|家暴事实, 保护令申请书|人身安全保护令, 伤情照片|就医记录|威胁记录, 当事人陈述; missing risk directions: 人身安全, 保护令, 及时报警|安全风险, 感情破裂; confirmed_claims present but evidence lists are empty
- G030 (optional_expansion, 亲子关系确认/否认): score 74, modules intent, error_type intent_miss; missing intent: 亲子关系确认/否认; missing evidence directions: 身份材料

## Passed But Not Full Score Optional Optimization
- G003 (core, 抚养费): score 95, reason: missing evidence directions: 生活费|日常生活支出
- G004 (core, 探望权): score 83, reason: missing evidence directions: 出生证明|户口簿|亲子关系, 探望安排|探望计划
- G008 (core, 家暴 / 人身安全保护): score 83, reason: missing evidence directions: 威胁聊天记录|威胁记录|录音录像, 当事人陈述|事实经过
- G009 (core, 离婚损害赔偿): score 94, reason: missing evidence directions: 同居证据|共同生活证据
- G012 (core, 追回第三者赠与): score 94, reason: missing evidence directions: 银行流水|账户流水
- G015 (core, 财产转移): score 80, reason: missing intent: 子女抚养权
- G016 (core, 离婚; 追回第三者赠与): score 95, reason: missing evidence directions: 银行流水
- G017 (core, 离婚; 子女抚养权; 抚养费): score 95, reason: missing evidence directions: 教育支出|医疗支出
- G019 (core, 财产分割; 财产转移): score 95, reason: missing evidence directions: 财产清单
- G027 (core, 子女抚养权): score 80, reason: missing intent: 子女抚养权
- G029 (core, 财产分割): score 92, reason: missing evidence directions: 结婚证|婚姻登记

## Safety
- evidence_scope_pass_rate regression: false
- json_schema_pass_rate regression: false