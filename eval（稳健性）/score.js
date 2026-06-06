#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

export function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  let text = value.trim();
  if (!text) return value;
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!match) return value;
    try {
      return JSON.parse(match[1]);
    } catch {
      return value;
    }
  }
}

export function extractPayload(raw) {
  const candidates = [];
  if (isRecord(raw)) {
    candidates.push(raw);
    if (isRecord(raw.result)) candidates.push(raw.result);
    const answer = parseMaybeJson(raw.answer);
    if (isRecord(answer)) candidates.push(answer);
    if (isRecord(raw.data)) {
      candidates.push(raw.data);
      if (isRecord(raw.data.outputs)) candidates.push(raw.data.outputs);
      if (isRecord(raw.data.outputs?.structured_output)) candidates.push(raw.data.outputs.structured_output);
      const outputText = parseMaybeJson(raw.data.outputs?.text);
      if (isRecord(outputText)) candidates.push(outputText);
      const answerText = parseMaybeJson(raw.data.answer);
      if (isRecord(answerText)) candidates.push(answerText);
    }
    if (isRecord(raw.outputs)) candidates.push(raw.outputs);
    if (isRecord(raw.outputs?.structured_output)) candidates.push(raw.outputs.structured_output);
  }

  for (const candidate of candidates) {
    if (
      candidate.candidate_claims ||
      candidate.excluded_claims ||
      candidate.final_evidence_list_for_user ||
      candidate.evidence_list ||
      candidate.risk_tips ||
      candidate.core_evidence
    ) {
      return candidate;
    }
  }
  return candidates[0] || {};
}

function normalizeText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function compact(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, "");
}

function includesLoose(haystack, needle) {
  const h = compact(haystack);
  const n = compact(needle);
  if (!n) return true;
  return h.includes(n);
}

export function matchesAnyAlternative(text, pattern) {
  return normalizeText(pattern)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .some((item) => includesLoose(text, item));
}

const CLAIM_ALIASES = new Map([
  ["人身安全保护令", "家暴 / 人身安全保护"],
  ["申请保护令", "家暴 / 人身安全保护"],
  ["家暴保护令", "家暴 / 人身安全保护"],
  ["家庭暴力保护", "家暴 / 人身安全保护"],
  ["家暴/人身安全保护", "家暴 / 人身安全保护"],
  ["家庭暴力/人身安全保护", "家暴 / 人身安全保护"],
  ["追回被转移的夫妻共同财产", "财产转移"],
  ["隐藏转移财产", "财产转移"],
  ["转移夫妻共同财产", "财产转移"],
  ["损害赔偿", "离婚损害赔偿"],
  ["离婚赔偿", "离婚损害赔偿"],
  ["亲子关系确认", "亲子关系确认/否认"],
  ["亲子关系否认", "亲子关系确认/否认"],
]);

function normalizeClaimName(value) {
  const raw = normalizeText(value).trim();
  const noSpace = raw.replace(/\s+/g, "").replace(/／/g, "/");
  const alias = CLAIM_ALIASES.get(raw) || CLAIM_ALIASES.get(noSpace);
  return (alias || raw).replace(/\s+/g, "").replace(/／/g, "/");
}

function namesInclude(actualNames, expectedName) {
  const expected = normalizeClaimName(expectedName);
  return actualNames.some((name) => {
    const actual = normalizeClaimName(name);
    return actual.includes(expected) || expected.includes(actual);
  });
}

function normalizeClaim(raw) {
  if (typeof raw === "string") return { claim_name: raw.trim(), confidence: "", reason: "" };
  if (!isRecord(raw)) return null;
  const claimName = String(raw.claim_name || raw.claim || raw.name || raw.text || "").trim();
  if (!claimName) return null;
  return {
    claim_name: claimName,
    confidence: String(raw.confidence || raw.label || raw.level || ""),
    reason: String(raw.reason || raw.display_reason || ""),
  };
}

export function adaptIntent(raw) {
  const payload = extractPayload(raw);
  const candidateSource = payload.candidate_claims || payload.possible_claims || payload.claim_cards || payload.claims || [];
  const excludedSource = payload.excluded_claims || [];
  const missingSource = payload.missing_info || payload.missing_information || [];
  const candidate_claims = Array.isArray(candidateSource) ? candidateSource.map(normalizeClaim).filter(Boolean) : [];
  const excluded_claims = Array.isArray(excludedSource)
    ? excludedSource
        .map((item) => {
          if (typeof item === "string") return { claim_name: item.trim(), reason: "" };
          if (!isRecord(item)) return null;
          return { claim_name: String(item.claim_name || item.claim || item.name || "").trim(), reason: String(item.reason || "") };
        })
        .filter(Boolean)
    : [];
  const missing_info = Array.isArray(missingSource) ? missingSource.map(String) : [];
  return { candidate_claims, excluded_claims, missing_info };
}

function normalizeEvidenceItem(item, priority) {
  if (typeof item === "string") {
    return { evidence_name: item.trim(), priority, note: "", prepared: false };
  }
  if (!isRecord(item)) return null;
  return {
    evidence_name: String(item.evidence_name || item.evidence || item.item || item.name || "").trim(),
    priority: String(item.priority || priority || ""),
    note: String(item.note || item.reason || item.proves || item.description || ""),
    prepared: typeof item.prepared === "boolean" ? item.prepared : false,
  };
}

function hasEvidenceItemSchema(item) {
  return (
    isRecord(item) &&
    Object.prototype.hasOwnProperty.call(item, "evidence_name") &&
    Object.prototype.hasOwnProperty.call(item, "priority") &&
    Object.prototype.hasOwnProperty.call(item, "note") &&
    Object.prototype.hasOwnProperty.call(item, "prepared")
  );
}

export function adaptEvidence(raw) {
  const payload = extractPayload(raw);
  const finalList = isRecord(payload.final_evidence_list_for_user) ? payload.final_evidence_list_for_user : null;
  const evidenceList = isRecord(payload.evidence_list) ? payload.evidence_list : {};
  const coreSource = finalList?.core_evidence || payload.core_evidence || evidenceList.core_evidence || [];
  const auxSource = finalList?.auxiliary_evidence || payload.auxiliary_evidence || evidenceList.auxiliary_evidence || evidenceList.supporting_evidence || [];
  const core_evidence = Array.isArray(coreSource) ? coreSource.map((item) => normalizeEvidenceItem(item, "核心证据")).filter(Boolean) : [];
  const auxiliary_evidence = Array.isArray(auxSource) ? auxSource.map((item) => normalizeEvidenceItem(item, "辅助证据")).filter(Boolean) : [];
  const riskSource = payload.risk_tips || payload.risks || payload.warnings || [];
  const risk_tips = Array.isArray(riskSource) ? riskSource.map(normalizeText).filter(Boolean) : [];
  const business_schema_present = Boolean(finalList);
  const raw_schema_valid =
    Boolean(finalList) &&
    Array.isArray(finalList.core_evidence) &&
    Array.isArray(finalList.auxiliary_evidence) &&
    [...finalList.core_evidence, ...finalList.auxiliary_evidence].every(hasEvidenceItemSchema);
  return {
    final_evidence_list_for_user: { core_evidence, auxiliary_evidence },
    risk_tips,
    payload,
    business_schema_present,
    raw_schema_valid,
  };
}

export function extractOptionalObserved(raw) {
  const found = { queryCleaner: null, retrievedRuleIds: null };
  function visit(value, keyPath = []) {
    if (value == null) return;
    const key = keyPath.at(-1) || "";
    if (/query.*clean|clean.*query|rewritten_query|cleaned_query/i.test(key) && found.queryCleaner == null) {
      found.queryCleaner = value;
    }
    if (/retrieved.*rule|rule.*ids|retrieval.*ids/i.test(key) && found.retrievedRuleIds == null) {
      found.retrievedRuleIds = value;
    }
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      if (parsed !== value) visit(parsed, keyPath.concat("parsed"));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, keyPath.concat(String(index))));
      return;
    }
    if (isRecord(value)) {
      for (const [childKey, childValue] of Object.entries(value)) visit(childValue, keyPath.concat(childKey));
    }
  }
  visit(raw);
  const ids = Array.isArray(found.retrievedRuleIds)
    ? found.retrievedRuleIds.map(String)
    : typeof found.retrievedRuleIds === "string"
      ? found.retrievedRuleIds.match(/[A-Z]+(?:_[A-Z0-9]+)+/g) || []
      : null;
  return { actual_query_cleaner_output: found.queryCleaner, actual_retrieved_rule_ids: ids };
}

function countPatternHits(text, patterns = []) {
  return patterns.filter((pattern) => matchesAnyAlternative(text, pattern));
}

function passByCoverage(hits, total) {
  if (total === 0) return true;
  if (total <= 2) return hits === total;
  return hits / total >= 0.6;
}

function isHighConfidence(confidence) {
  return /high|明确|高|strong/i.test(normalizeText(confidence));
}

function selectPrimaryError(failedModules, result, invalidBusiness, emptyEvidence) {
  if (result.error) return "api_error";
  if (invalidBusiness) return "invalid_business_output";
  if (failedModules.includes("json_schema")) return "json_schema_error";
  if (emptyEvidence) return "empty_evidence_output";
  if (failedModules.includes("evidence_scope")) return "evidence_scope_violation";
  if (failedModules.includes("evidence_keywords")) return "evidence_keyword_miss";
  if (failedModules.includes("intent")) return "intent_miss";
  if (failedModules.includes("excluded_claims")) return "excluded_claims_miss";
  if (failedModules.includes("risk_tips")) return "risk_tips_miss";
  return "";
}

export function scoreCase(result) {
  const testCase = result.case;
  const intent = result.parsed_intent || adaptIntent(result.intent_raw);
  const evidence = result.parsed_evidence || adaptEvidence(result.evidence_raw);
  const allEvidenceItems = [
    ...(evidence.final_evidence_list_for_user?.core_evidence || []),
    ...(evidence.final_evidence_list_for_user?.auxiliary_evidence || []),
  ];
  const allEvidenceText = allEvidenceItems.map((item) => `${item.evidence_name} ${item.note}`).join("\n");
  const riskText = (evidence.risk_tips || []).join("\n");
  const evidenceAndRiskText = `${allEvidenceText}\n${riskText}`;

  const candidateNames = (intent.candidate_claims || []).map((claim) => claim.claim_name);
  const excludedNames = (intent.excluded_claims || []).map((claim) => claim.claim_name);
  const highConfidenceNames = (intent.candidate_claims || [])
    .filter((claim) => isHighConfidence(claim.confidence))
    .map((claim) => claim.claim_name);

  const expectedIntent = testCase.expected_intent_claims || [];
  const expectedExcluded = testCase.expected_excluded_claims || [];
  const disallowedHigh = testCase.disallowed_high_confidence_intent_claims || [];
  const evidenceExpectation = testCase.evidence_expectation || {};
  const mustInclude = evidenceExpectation.must_include || [];
  const mustNotInclude = evidenceExpectation.must_not_include || [];
  const riskExpectation = testCase.risk_expectation || {};
  const expectedRisk = riskExpectation.any_of || [];

  const missingIntent = expectedIntent.filter((claim) => !namesInclude(candidateNames, claim));
  const intent_pass = missingIntent.length === 0;

  const excludedFailures = expectedExcluded.filter((claim) => !namesInclude(excludedNames, claim) && namesInclude(highConfidenceNames, claim));
  const disallowedHighFailures = disallowedHigh.filter((claim) => namesInclude(highConfidenceNames, claim));
  const excluded_claims_pass = excludedFailures.length === 0 && disallowedHighFailures.length === 0;

  const evidenceHits = countPatternHits(allEvidenceText, mustInclude);
  const evidence_keywords_pass = passByCoverage(evidenceHits.length, mustInclude.length) && !(testCase.confirmed_claims?.length && allEvidenceItems.length === 0);

  const forbiddenHits = countPatternHits(allEvidenceText, mustNotInclude);
  const evidence_scope_pass = forbiddenHits.length === 0;

  const riskHits = countPatternHits(evidenceAndRiskText, expectedRisk);
  const riskRequired = riskExpectation.required !== false && expectedRisk.length > 0;
  const risk_tips_pass = !riskRequired || riskHits.length > 0;

  const schemaHasArrays =
    Array.isArray(evidence.final_evidence_list_for_user?.core_evidence) &&
    Array.isArray(evidence.final_evidence_list_for_user?.auxiliary_evidence);
  const adaptedItemSchema = allEvidenceItems.every((item) => hasEvidenceItemSchema(item));
  const json_schema_pass = Boolean(evidence.raw_schema_valid || (evidence.business_schema_present && schemaHasArrays && adaptedItemSchema));
  const invalidBusiness = !evidence.business_schema_present && !result.evidence_raw?.skipped;
  const emptyEvidence = Boolean((testCase.confirmed_claims || []).length && json_schema_pass && allEvidenceItems.length === 0);

  const optional = result.optional_observed || extractOptionalObserved(result.evidence_raw);
  const queryCleanerObserved = optional.actual_query_cleaner_output != null;
  const retrievedObserved = Array.isArray(optional.actual_retrieved_rule_ids) && optional.actual_retrieved_rule_ids.length > 0;
  const queryCleanerText = normalizeText(optional.actual_query_cleaner_output);
  const queryCleanerHits = countPatternHits(queryCleanerText, testCase.optional_expected_query_keywords || []);
  const retrievalHits = retrievedObserved
    ? (testCase.optional_expected_retrieved_rule_ids || []).filter((id) => optional.actual_retrieved_rule_ids.includes(id))
    : [];

  const query_cleaner_pass = queryCleanerObserved
    ? passByCoverage(queryCleanerHits.length, (testCase.optional_expected_query_keywords || []).length)
    : "not_observed";
  const retrieval_pass = retrievedObserved
    ? passByCoverage(retrievalHits.length, (testCase.optional_expected_retrieved_rule_ids || []).length)
    : "not_observed";
  const retrieval_top3_hit = retrievedObserved
    ? (optional.actual_retrieved_rule_ids || []).slice(0, 3).some((id) => (testCase.optional_expected_retrieved_rule_ids || []).includes(id))
    : "not_observed";

  let total_score = 0;
  total_score += intent_pass ? 20 : 0;
  total_score += excluded_claims_pass ? 10 : 0;
  total_score += Math.round(25 * (mustInclude.length ? evidenceHits.length / mustInclude.length : 1));
  total_score += evidence_scope_pass ? 25 : 0;
  total_score += json_schema_pass ? 10 : 0;
  total_score += risk_tips_pass ? 10 : 0;
  total_score = Math.max(0, Math.min(100, total_score));

  const failed_modules = [];
  if (!intent_pass) failed_modules.push("intent");
  if (!excluded_claims_pass) failed_modules.push("excluded_claims");
  if (!evidence_keywords_pass) failed_modules.push("evidence_keywords");
  if (!evidence_scope_pass) failed_modules.push("evidence_scope");
  if (!json_schema_pass) failed_modules.push("json_schema");
  if (!risk_tips_pass) failed_modules.push("risk_tips");

  const overall_pass = total_score >= 80 && evidence_scope_pass && json_schema_pass && !emptyEvidence && !invalidBusiness && !result.error;
  const error_type = overall_pass ? "" : selectPrimaryError(failed_modules, result, invalidBusiness, emptyEvidence);
  const error_reason = [
    missingIntent.length ? `missing intent: ${missingIntent.join(", ")}` : "",
    excludedFailures.length ? `expected excluded appeared high-confidence: ${excludedFailures.join(", ")}` : "",
    disallowedHighFailures.length ? `disallowed high-confidence claims: ${disallowedHighFailures.join(", ")}` : "",
    evidenceHits.length < mustInclude.length ? `missing evidence directions: ${mustInclude.filter((k) => !evidenceHits.includes(k)).join(", ")}` : "",
    forbiddenHits.length ? `must-not-include evidence hit: ${forbiddenHits.join(", ")}` : "",
    !risk_tips_pass ? `missing risk directions: ${expectedRisk.join(", ")}` : "",
    invalidBusiness ? "valid JSON but missing final_evidence_list_for_user business schema" : "",
    emptyEvidence ? "confirmed_claims present but evidence lists are empty" : "",
    !json_schema_pass && !invalidBusiness ? "invalid evidence JSON schema" : "",
    result.error ? normalizeText(result.error) : "",
  ].filter(Boolean).join("; ");

  return {
    intent_pass,
    excluded_claims_pass,
    evidence_keywords_pass,
    evidence_scope_pass,
    risk_tips_pass,
    json_schema_pass,
    query_cleaner_pass,
    retrieval_pass,
    retrieval_top3_hit,
    overall_pass,
    total_score,
    failed_modules,
    error_type,
    error_reason,
    details: {
      missing_intent_claims: missingIntent,
      excluded_failures: excludedFailures,
      disallowed_high_confidence_failures: disallowedHighFailures,
      evidence_must_include_hits: evidenceHits,
      evidence_must_not_include_hits: forbiddenHits,
      risk_hits: riskHits,
      query_cleaner_observed: queryCleanerObserved,
      retrieval_observed: retrievedObserved,
      retrieval_hits: retrievalHits,
      business_schema_present: evidence.business_schema_present,
      empty_evidence_output: emptyEvidence,
      invalid_business_output: invalidBusiness,
    },
  };
}

export function summarize(scoredResults, version = "baseline") {
  const total = scoredResults.length || 1;
  const avg = (items) => items.reduce((sum, value) => sum + value, 0) / total;
  const passRate = (field) => avg(scoredResults.map((item) => item.score?.[field] === true ? 1 : 0));
  const queryObserved = scoredResults.filter((item) => item.score?.query_cleaner_pass !== "not_observed");
  const retrievalObserved = scoredResults.filter((item) => item.score?.retrieval_pass !== "not_observed");
  const latencies = scoredResults.map((item) => item.latency_ms || 0).filter((value) => value > 0);
  return {
    version,
    total_cases: scoredResults.length,
    overall_pass_rate: passRate("overall_pass"),
    average_score: avg(scoredResults.map((item) => item.score?.total_score || 0)),
    intent_pass_rate: passRate("intent_pass"),
    excluded_claims_pass_rate: passRate("excluded_claims_pass"),
    evidence_keywords_pass_rate: passRate("evidence_keywords_pass"),
    evidence_scope_pass_rate: passRate("evidence_scope_pass"),
    json_schema_pass_rate: passRate("json_schema_pass"),
    risk_tips_pass_rate: passRate("risk_tips_pass"),
    query_cleaner_observed_count: queryObserved.length,
    retrieval_observed_count: retrievalObserved.length,
    query_cleaner_pass_rate_if_observed: queryObserved.length ? queryObserved.filter((item) => item.score.query_cleaner_pass === true).length / queryObserved.length : "not_observed",
    retrieval_pass_rate_if_observed: retrievalObserved.length ? retrievalObserved.filter((item) => item.score.retrieval_pass === true).length / retrievalObserved.length : "not_observed",
    average_latency_ms: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0,
    total_errors: scoredResults.filter((item) => item.error || item.score?.overall_pass !== true).length,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const versionIndex = process.argv.indexOf("--version");
  const version = versionIndex >= 0 ? process.argv[versionIndex + 1] || "baseline" : "baseline";
  const reportDir = path.join(ROOT, "eval", "reports", version);
  const rawPath = path.join(reportDir, "raw_results.json");
  if (!fs.existsSync(rawPath)) {
    console.error(`Missing ${rawPath}. Run eval/run-eval.js first.`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
  const scored = raw.results.map((item) => ({ ...item, score: scoreCase(item) }));
  const summary = summarize(scored, version);
  fs.writeFileSync(rawPath, JSON.stringify({ ...raw, results: scored }, null, 2), "utf8");
  fs.writeFileSync(path.join(reportDir, `${version}_summary.json`), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}
