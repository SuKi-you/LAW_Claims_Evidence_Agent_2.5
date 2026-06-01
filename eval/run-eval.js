#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { adaptEvidence, adaptIntent, extractOptionalObserved, scoreCase, summarize } from "./score.js";
import { createCharts } from "./charts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CASES_PATH = path.join(__dirname, "cases.json");
const ENV_FILES = [path.join(ROOT, ".env.test.local"), path.join(ROOT, ".env")];
const REQUIRED_ENV_KEYS = ["DIFY_API_BASE_URL", "DIFY_INTENT_API_KEY", "DIFY_EVIDENCE_API_KEY"];

function parseArgs(argv) {
  const args = { version: "baseline", limit: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--version") args.version = argv[++i] || args.version;
    else if (argv[i] === "--limit") args.limit = Number(argv[++i]);
  }
  return args;
}

function readEnv() {
  const values = {};
  const warnings = [];
  let foundAny = false;
  for (const filePath of ENV_FILES) {
    if (!fs.existsSync(filePath)) continue;
    foundAny = true;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      const key = match[1];
      if (!REQUIRED_ENV_KEYS.includes(key) && !/^VITE_DIFY_.*TIMEOUT_MS$/.test(key)) continue;
      if (values[key]) continue;
      let value = match[2].trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
  }
  if (!foundAny) warnings.push("Missing .env.test.local and .env at project root.");
  for (const key of REQUIRED_ENV_KEYS) {
    if (!values[key]) warnings.push(`Missing ${key}; related Dify calls will be skipped.`);
  }
  return { values, warnings };
}

function joinDifyUrl(baseUrl, endpoint) {
  const normalized = String(baseUrl || "").replace(/\/+$/, "");
  if (!normalized) return "";
  if (normalized.endsWith("/v1")) return `${normalized}${endpoint}`;
  return `${normalized}/v1${endpoint}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redact(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.replace(/app-[A-Za-z0-9_-]{8,}/g, "app-***REDACTED***").replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***REDACTED***");
}

async function postDify({ baseUrl, apiKey, body, timeoutMs }) {
  const url = joinDifyUrl(baseUrl, "/chat-messages");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw_text: text };
    }
    if (!response.ok) {
      const error = new Error(`Dify HTTP ${response.status}`);
      error.type = "http_error";
      error.status = response.status;
      error.response = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(fn, attempts = 3) {
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await sleep(1000 * (i + 1));
    }
  }
  throw lastError;
}

async function runCase(testCase, env, reportDir) {
  const started = Date.now();
  const rawDir = path.join(reportDir, "raw");
  fs.mkdirSync(rawDir, { recursive: true });
  const result = {
    case: testCase,
    intent_raw: null,
    evidence_raw: null,
    parsed_intent: null,
    parsed_evidence: null,
    optional_observed: null,
    latency_ms: 0,
    error: null,
    raw_output_path: path.join(rawDir, `${testCase.case_id}.json`),
  };

  try {
    if (!env.DIFY_API_BASE_URL || !env.DIFY_INTENT_API_KEY) {
      result.intent_raw = { skipped: true, reason: "Missing DIFY_API_BASE_URL or DIFY_INTENT_API_KEY." };
    } else {
      result.intent_raw = await withRetry(() =>
        postDify({
          baseUrl: env.DIFY_API_BASE_URL,
          apiKey: env.DIFY_INTENT_API_KEY,
          timeoutMs: Number(env.VITE_DIFY_INTENT_TIMEOUT_MS) || 45000,
          body: {
            inputs: { query: testCase.query },
            query: testCase.query,
            response_mode: "blocking",
            user: "eval-user",
          },
        })
      );
    }
    result.parsed_intent = adaptIntent(result.intent_raw);
  } catch (error) {
    result.intent_raw = { error: error.message, status: error.status, response: error.response };
    result.error = { type: error.type || "intent_error", message: error.message, status: error.status };
    result.parsed_intent = adaptIntent(result.intent_raw);
  }

  try {
    if (!env.DIFY_API_BASE_URL || !env.DIFY_EVIDENCE_API_KEY) {
      result.evidence_raw = { skipped: true, reason: "Missing DIFY_API_BASE_URL or DIFY_EVIDENCE_API_KEY." };
    } else {
      result.evidence_raw = await withRetry(() =>
        postDify({
          baseUrl: env.DIFY_API_BASE_URL,
          apiKey: env.DIFY_EVIDENCE_API_KEY,
          timeoutMs: Number(env.VITE_DIFY_EVIDENCE_TIMEOUT_MS) || 60000,
          body: {
            inputs: {
              query: testCase.query,
              confirmed_claims: JSON.stringify(testCase.confirmed_claims || []),
            },
            query: testCase.query,
            response_mode: "blocking",
            user: "eval-user",
          },
        })
      );
    }
    result.parsed_evidence = adaptEvidence(result.evidence_raw);
    result.optional_observed = extractOptionalObserved(result.evidence_raw);
  } catch (error) {
    result.evidence_raw = { error: error.message, status: error.status, response: error.response };
    result.error = result.error || { type: error.type || "evidence_error", message: error.message, status: error.status };
    result.parsed_evidence = adaptEvidence(result.evidence_raw);
    result.optional_observed = extractOptionalObserved(result.evidence_raw);
  }

  result.latency_ms = Date.now() - started;
  result.score = scoreCase(result);
  fs.writeFileSync(result.raw_output_path, redact(JSON.stringify(result, null, 2)));
  return result;
}

function flattenEvidence(items) {
  return (items || []).map((item) => `${item.evidence_name} | ${item.priority} | ${item.note}`).join("\n");
}

function pct(value) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : value;
}

function loadCases() {
  const payload = JSON.parse(fs.readFileSync(CASES_PATH, "utf8"));
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.cases)) return payload.cases;
  throw new Error("eval/cases.json must be an array or an object with a cases array.");
}

function rowsForExcel(results, summary, version) {
  const summaryRows = Object.entries(summary).map(([field, value]) => ({ field, value: typeof value === "number" ? Number(value.toFixed(4)) : value }));
  const caseRows = results.map((item) => ({
    case_id: item.case.case_id,
    case_type: item.case.case_type,
    claim_types: (item.case.claim_types || []).join("; "),
    query: item.case.query,
    confirmed_claims: (item.case.confirmed_claims || []).join("; "),
    expected_intent_claims: (item.case.expected_intent_claims || []).join("; "),
    actual_candidate_claims: (item.parsed_intent?.candidate_claims || []).map((claim) => `${claim.claim_name}:${claim.confidence}`).join("; "),
    expected_excluded_claims: (item.case.expected_excluded_claims || []).join("; "),
    disallowed_high_confidence_intent_claims: (item.case.disallowed_high_confidence_intent_claims || []).join("; "),
    actual_excluded_claims: (item.parsed_intent?.excluded_claims || []).map((claim) => claim.claim_name).join("; "),
    evidence_must_include: (item.case.evidence_expectation?.must_include || []).join("; "),
    evidence_allowed_include: (item.case.evidence_expectation?.allowed_include || []).join("; "),
    evidence_must_not_include: (item.case.evidence_expectation?.must_not_include || []).join("; "),
    risk_expectation_any_of: (item.case.risk_expectation?.any_of || []).join("; "),
    actual_core_evidence: flattenEvidence(item.parsed_evidence?.final_evidence_list_for_user?.core_evidence),
    actual_auxiliary_evidence: flattenEvidence(item.parsed_evidence?.final_evidence_list_for_user?.auxiliary_evidence),
    risk_tips: (item.parsed_evidence?.risk_tips || []).join("\n"),
    actual_query_cleaner_output: item.optional_observed?.actual_query_cleaner_output == null ? "" : JSON.stringify(item.optional_observed.actual_query_cleaner_output),
    actual_retrieved_rule_ids: (item.optional_observed?.actual_retrieved_rule_ids || []).join("; "),
    intent_pass: item.score.intent_pass,
    excluded_claims_pass: item.score.excluded_claims_pass,
    evidence_keywords_pass: item.score.evidence_keywords_pass,
    evidence_scope_pass: item.score.evidence_scope_pass,
    risk_tips_pass: item.score.risk_tips_pass,
    json_schema_pass: item.score.json_schema_pass,
    query_cleaner_pass: item.score.query_cleaner_pass,
    retrieval_pass: item.score.retrieval_pass,
    retrieval_top3_hit: item.score.retrieval_top3_hit,
    total_score: item.score.total_score,
    overall_pass: item.score.overall_pass,
    error_type: item.score.error_type,
    error_reason: item.score.error_reason,
    latency_ms: item.latency_ms,
  }));
  const errorRows = results
    .filter((item) => !item.score.overall_pass || item.error)
    .map((item) => ({
      case_id: item.case.case_id,
      query: item.case.query,
      confirmed_claims: (item.case.confirmed_claims || []).join("; "),
      failed_modules: (item.score.failed_modules || []).join("; "),
      error_type: item.score.error_type,
      error_reason: item.score.error_reason,
      raw_output_path: item.raw_output_path,
    }));
  const byClaim = [];
  const claimMap = new Map();
  for (const item of results) {
    for (const claim of item.case.claim_types || []) {
      if (!claimMap.has(claim)) claimMap.set(claim, []);
      claimMap.get(claim).push(item);
    }
  }
  for (const [claim_type, items] of claimMap) {
    byClaim.push({
      claim_type,
      case_count: items.length,
      overall_pass_rate: items.filter((item) => item.score.overall_pass).length / items.length,
      average_score: items.reduce((sum, item) => sum + item.score.total_score, 0) / items.length,
      evidence_scope_violation_count: items.filter((item) => !item.score.evidence_scope_pass).length,
    });
  }
  const rawOutputRows = results.map((item) => ({
    case_id: item.case.case_id,
    raw_output_path: item.raw_output_path,
    intent_excerpt: JSON.stringify(item.intent_raw || {}).slice(0, 500),
    evidence_excerpt: JSON.stringify(item.evidence_raw || {}).slice(0, 500),
  }));
  return { summaryRows, caseRows, errorRows, byClaim, rawOutputRows };
}

function writeExcel(results, summary, version, reportDir) {
  const workbook = XLSX.utils.book_new();
  const rows = rowsForExcel(results, summary, version);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.summaryRows), "summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.caseRows), "cases");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.errorRows), "errors");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.byClaim), "by_claim_type");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.rawOutputRows), "raw_outputs");
  const xlsxPath = path.join(reportDir, `${version}_eval.xlsx`);
  XLSX.writeFile(workbook, xlsxPath);
  return xlsxPath;
}

function writeMarkdownReport(results, summary, version, reportDir, warnings) {
  const failed = results.filter((item) => !item.score.overall_pass);
  const lines = [
    `# Agent 2.5 ${version} Eval Report`,
    "",
    `- Total cases: ${summary.total_cases}`,
    `- Overall pass rate: ${pct(summary.overall_pass_rate)}`,
    `- Average score: ${summary.average_score.toFixed(1)}`,
    `- Intent pass rate: ${pct(summary.intent_pass_rate)}`,
    `- Evidence scope pass rate: ${pct(summary.evidence_scope_pass_rate)}`,
    `- JSON schema pass rate: ${pct(summary.json_schema_pass_rate)}`,
    `- Query cleaner observed: ${summary.query_cleaner_observed_count}`,
    `- Retrieval observed: ${summary.retrieval_observed_count}`,
    "",
    "## Warnings",
    ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
    "## Failed Cases",
    ...(failed.length
      ? failed.map((item) => `- ${item.case.case_id} ${item.case.case_type}: score ${item.score.total_score}, modules ${item.score.failed_modules.join(", ") || "none"}; ${item.score.error_reason}`)
      : ["- None"]),
    "",
    "## Notes",
    "- API keys are read from local env files but are not written into reports.",
    "- query_cleaner and retrieval metrics are scored only when the Dify response exposes observable fields.",
  ];
  const mdPath = path.join(reportDir, `${version}_report.md`);
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
  return mdPath;
}

async function main() {
  const args = parseArgs(process.argv);
  const { values: env, warnings } = readEnv();
  const version = args.version;
  const allCases = loadCases();
  const cases = Number.isFinite(args.limit) && args.limit > 0 ? allCases.slice(0, args.limit) : allCases;
  const reportDir = path.join(__dirname, "reports", version);
  if (fs.existsSync(reportDir)) fs.rmSync(reportDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(reportDir, "raw"), { recursive: true });
  fs.mkdirSync(path.join(reportDir, "charts"), { recursive: true });

  const results = [];
  for (let index = 0; index < cases.length; index++) {
    const testCase = cases[index];
    console.log(`[eval] ${index + 1}/${cases.length} ${testCase.case_id} ${testCase.case_type}`);
    const result = await runCase(testCase, env, reportDir);
    results.push(result);
    if (index < cases.length - 1) await sleep(1000);
  }

  const summary = summarize(results, version);
  const rawResults = { version, generated_at: new Date().toISOString(), warnings, results };
  fs.writeFileSync(path.join(reportDir, "raw_results.json"), redact(JSON.stringify(rawResults, null, 2)), "utf8");
  fs.writeFileSync(path.join(reportDir, `${version}_summary.json`), JSON.stringify(summary, null, 2), "utf8");
  const excelPath = writeExcel(results, summary, version, reportDir);
  createCharts(results, summary, path.join(reportDir, "charts"));
  const reportPath = writeMarkdownReport(results, summary, version, reportDir, warnings);

  console.log("[eval] complete");
  console.log(JSON.stringify({
    version,
    cases: cases.length,
    overall_pass_rate: summary.overall_pass_rate,
    average_score: summary.average_score,
    excel: excelPath,
    markdown: reportPath,
    charts: path.join(reportDir, "charts"),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
