旧 baseline 的 raw_results 来自上一版 40 条 case，字段使用 expected_evidence_keywords / forbidden_evidence_keywords。

Golden Eval v1 已替换为 30 条新 case，并使用 evidence_expectation.must_include / allowed_include / must_not_include 与 risk_expectation 评分。由于 case 集和评分字段均不一致，旧 raw_results 不能作为新 baseline 的主评分或可比离线校准结果。

本轮仅保留旧结果到 baseline_old，并重新调用 Dify 跑 30 条 golden cases 生成新的 baseline。
