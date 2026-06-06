# Baseline vs Optimized v6 Eval

## Metrics
| Metric | Baseline | Optimized v6 | Delta |
|---|---:|---:|---:|
| overall_pass_rate | 73.3% | 56.7% | -16.7% |
| core_overall_pass_rate | 78.6% | 60.7% | -17.9% |
| optional_overall_pass_rate | 0.0% | 0.0% | 0.0% |
| average_score | 87.2 | 81.7 | -5.5 |
| core_average_score | 88.2 | 83.3 | -4.9 |
| intent_pass_rate | 70.0% | 86.7% | 16.7% |
| excluded_claims_pass_rate | 100.0% | 100.0% | 0.0% |
| evidence_keywords_pass_rate | 86.7% | 63.3% | -23.3% |
| evidence_scope_pass_rate | 100.0% | 100.0% | 0.0% |
| json_schema_pass_rate | 100.0% | 90.0% | -10.0% |
| risk_tips_pass_rate | 80.0% | 63.3% | -16.7% |
| total_errors | 8.0 | 13.0 | 5.0 |
| average_latency_ms | 43410.6 | 44393.6 | 983.0 |

## Baseline Failed But Optimized v6 Passed
- G003 (core, 抚养费): 70 -> 100
- G004 (core, 探望权): 65 -> 100
- G006 (core, 财产转移): 45 -> 100
- G012 (core, 追回第三者赠与): 74 -> 94

## Optimized v6 Still Failed
- G001 (core, 离婚): score 65, modules evidence_keywords; risk_tips, error_type empty_evidence_output; missing evidence directions: 身份证, 结婚证|婚姻登记, 感情破裂|分居|沟通记录; missing risk directions: 冷静期|三十日|30天, 感情破裂, 对方不同意|诉讼离婚; confirmed_claims present but evidence lists are empty
- G007 (core, 追回第三者赠与): score 65, modules evidence_keywords; risk_tips, error_type empty_evidence_output; missing evidence directions: 转账记录|微信转账|支付宝转账, 银行流水|账户流水, 第三者身份|小三身份, 赠与目的|特殊金额|聊天记录, 异常转账时间线|时间线; missing risk directions: 赠与性质, 公序良俗, 夫妻共同财产, 第三者身份; confirmed_claims present but evidence lists are empty
- G008 (core, 家暴 / 人身安全保护): score 65, modules evidence_keywords; risk_tips, error_type empty_evidence_output; missing evidence directions: 保护令申请书|人身安全保护令, 威胁聊天记录|威胁记录|录音录像, 当事人陈述|事实经过; missing risk directions: 安全风险, 及时报警|报警留痕, 保护令, 证据留存; confirmed_claims present but evidence lists are empty
- G010 (optional_expansion, 彩礼返还): score 74, modules intent, error_type intent_miss; missing intent: 彩礼返还; missing evidence directions: 双方分开|解除关系
- G011 (core, 离婚): score 65, modules evidence_keywords; risk_tips, error_type evidence_keyword_miss; missing evidence directions: 身份证, 结婚证|婚姻登记, 感情破裂|分居|沟通记录; missing risk directions: 冷静期|诉讼离婚, 感情破裂
- G015 (core, 财产转移): score 70, modules intent; json_schema, error_type invalid_business_output; missing intent: 子女抚养权; valid JSON but missing final_evidence_list_for_user business schema
- G017 (core, 离婚; 子女抚养权; 抚养费): score 65, modules evidence_keywords; risk_tips, error_type evidence_keyword_miss; missing evidence directions: 结婚证|婚姻登记, 出生证明|户口簿, 实际照顾, 收入证明, 教育支出|医疗支出; missing risk directions: 子女利益|最有利于未成年子女, 抚养费, 感情破裂|冷静期
- G020 (core, 离婚): score 55, modules evidence_keywords; json_schema; risk_tips, error_type invalid_business_output; missing evidence directions: 身份证, 结婚证|婚姻登记, 感情破裂|分居|沟通记录; missing risk directions: 冷静期|三十日|30天, 感情破裂; valid JSON but missing final_evidence_list_for_user business schema
- G021 (core, 离婚): score 55, modules evidence_keywords; json_schema; risk_tips, error_type invalid_business_output; missing evidence directions: 身份证, 结婚证|婚姻登记, 感情破裂|沟通记录; missing risk directions: 感情破裂, 诉讼离婚|不同意离婚, 冷静期; valid JSON but missing final_evidence_list_for_user business schema
- G023 (core, 财产分割): score 65, modules evidence_keywords; risk_tips, error_type empty_evidence_output; missing evidence directions: 房产证|不动产登记, 购房合同|出资凭证, 财产清单; missing risk directions: 共同财产, 登记情况|出资情况, 财产线索; confirmed_claims present but evidence lists are empty
- G026 (core, 财产转移): score 45, modules intent; evidence_keywords; risk_tips, error_type empty_evidence_output; missing intent: 财产转移; missing evidence directions: 银行流水|账户流水, 异常转账|转账记录, 财产线索|藏钱线索; missing risk directions: 隐藏|转移, 及时固定证据, 财产保全; confirmed_claims present but evidence lists are empty
- G029 (core, 财产分割): score 65, modules evidence_keywords; risk_tips, error_type empty_evidence_output; missing evidence directions: 银行流水|银行存款|账户信息, 财产清单|财产线索, 结婚证|婚姻登记; missing risk directions: 财产线索, 账户, 共同财产, 法院调取; confirmed_claims present but evidence lists are empty
- G030 (optional_expansion, 亲子关系确认/否认): score 45, modules intent; evidence_keywords; risk_tips, error_type empty_evidence_output; missing intent: 亲子关系确认/否认; missing evidence directions: 出生证明|出生医学证明, 亲子鉴定|鉴定申请, 血型|医学材料, 身份材料; missing risk directions: 亲子鉴定, 未成年子女利益|子女利益, 法院委托|鉴定; confirmed_claims present but evidence lists are empty

## Regressed From Baseline Pass To Optimized v6 Fail
- G001 (离婚): 100 -> 65; missing evidence directions: 身份证, 结婚证|婚姻登记, 感情破裂|分居|沟通记录; missing risk directions: 冷静期|三十日|30天, 感情破裂, 对方不同意|诉讼离婚; confirmed_claims present but evidence lists are empty
- G007 (追回第三者赠与): 100 -> 65; missing evidence directions: 转账记录|微信转账|支付宝转账, 银行流水|账户流水, 第三者身份|小三身份, 赠与目的|特殊金额|聊天记录, 异常转账时间线|时间线; missing risk directions: 赠与性质, 公序良俗, 夫妻共同财产, 第三者身份; confirmed_claims present but evidence lists are empty
- G008 (家暴 / 人身安全保护): 92 -> 65; missing evidence directions: 保护令申请书|人身安全保护令, 威胁聊天记录|威胁记录|录音录像, 当事人陈述|事实经过; missing risk directions: 安全风险, 及时报警|报警留痕, 保护令, 证据留存; confirmed_claims present but evidence lists are empty
- G011 (离婚): 80 -> 65; missing evidence directions: 身份证, 结婚证|婚姻登记, 感情破裂|分居|沟通记录; missing risk directions: 冷静期|诉讼离婚, 感情破裂
- G017 (离婚; 子女抚养权; 抚养费): 100 -> 65; missing evidence directions: 结婚证|婚姻登记, 出生证明|户口簿, 实际照顾, 收入证明, 教育支出|医疗支出; missing risk directions: 子女利益|最有利于未成年子女, 抚养费, 感情破裂|冷静期
- G020 (离婚): 100 -> 55; missing evidence directions: 身份证, 结婚证|婚姻登记, 感情破裂|分居|沟通记录; missing risk directions: 冷静期|三十日|30天, 感情破裂; valid JSON but missing final_evidence_list_for_user business schema
- G021 (离婚): 100 -> 55; missing evidence directions: 身份证, 结婚证|婚姻登记, 感情破裂|沟通记录; missing risk directions: 感情破裂, 诉讼离婚|不同意离婚, 冷静期; valid JSON but missing final_evidence_list_for_user business schema
- G023 (财产分割): 100 -> 65; missing evidence directions: 房产证|不动产登记, 购房合同|出资凭证, 财产清单; missing risk directions: 共同财产, 登记情况|出资情况, 财产线索; confirmed_claims present but evidence lists are empty
- G029 (财产分割): 80 -> 65; missing evidence directions: 银行流水|银行存款|账户信息, 财产清单|财产线索, 结婚证|婚姻登记; missing risk directions: 财产线索, 账户, 共同财产, 法院调取; confirmed_claims present but evidence lists are empty

## Official Pass But Not Full Score Optional Optimization
- G009 (core, 离婚损害赔偿): score 94; missing evidence directions: 同居证据|共同生活证据
- G012 (core, 追回第三者赠与): score 94; missing evidence directions: 银行流水|账户流水
- G013 (core, 家暴 / 人身安全保护): score 94; missing evidence directions: 当事人陈述
- G018 (core, 离婚; 家暴 / 人身安全保护): score 90; missing evidence directions: 感情破裂|家暴事实, 当事人陈述
- G019 (core, 财产分割; 财产转移): score 95; missing evidence directions: 财产清单
- G025 (core, 家暴 / 人身安全保护): score 92; missing evidence directions: 当事人陈述
- G027 (core, 子女抚养权): score 94; missing evidence directions: 对方不管孩子|不参与抚养

## Safety
- evidence_scope regression: false
- json_schema regression: true