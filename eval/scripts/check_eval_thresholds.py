#!/usr/bin/env python3
import argparse
import csv
import sys
from pathlib import Path


DEFAULT_INTENT_SUMMARY = "eval/outputs/intent_eval_summary_v2.csv"
DEFAULT_EVIDENCE_SUMMARY = "eval/outputs/evidence_eval_summary.csv"
DEFAULT_AGENT_VERSION = "2.5"
EPSILON = 1e-9


CHECKS = {
    "intent": [
        ("Core Recall", ["avg_core_recall", "core_recall", "核心诉求召回率", "核心召回率"], 1.0),
        ("Precision", ["avg_precision", "precision", "诉求精确率", "精确率"], 0.8714),
        ("Robustness", ["avg_robustness", "robustness", "稳健性"], 1.0),
    ],
    "evidence": [
        ("Core Evidence Recall", ["avg_core_recall", "core_recall", "核心证据命中率", "核心证据召回率"], 1.0),
        ("Evidence Robustness", ["avg_robustness", "robustness", "证据稳健性", "稳健性"], 1.0),
        ("Evidence Score", ["avg_evidence_score", "evidence_score", "Evidence Score", "证据得分"], 1.0),
        ("Overall Pass Rate", ["overall_pass_rate", "整体通过率", "pass_rate"], 1.0),
    ],
}


def normalize_header(value):
    return "".join(str(value).strip().lower().replace("-", "_").split())


def read_csv_rows(path):
    csv_path = Path(path)
    if not csv_path.exists():
        raise FileNotFoundError(f"Summary CSV not found: {csv_path}")
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        headers = reader.fieldnames or []
    if not rows:
        raise ValueError(f"Summary CSV has no data rows: {csv_path}")
    return headers, rows


def find_column(headers, aliases):
    normalized = {normalize_header(header): header for header in headers}
    for alias in aliases:
        key = normalize_header(alias)
        if key in normalized:
            return normalized[key]
    return None


def find_agent_row(rows, headers, agent_version):
    version_column = find_column(headers, ["agent_version", "version", "Agent版本", "Agent 版本"])
    if not version_column:
        raise ValueError(
            "Cannot find agent version column. "
            f"Available headers: {', '.join(headers)}"
        )
    for row in rows:
        if str(row.get(version_column, "")).strip() == str(agent_version):
            return row
    raise ValueError(f"Cannot find Agent {agent_version} row in summary CSV.")


def parse_metric(raw_value, metric_name, column_name):
    text = str(raw_value).strip()
    if not text:
        raise ValueError(f"Metric {metric_name} column {column_name} is empty.")
    if text.endswith("%"):
        return float(text[:-1].strip()) / 100.0
    return float(text)


def run_checks(kind, path, agent_version):
    headers, rows = read_csv_rows(path)
    row = find_agent_row(rows, headers, agent_version)
    failures = []

    print(f"\n[{kind}] Checking Agent {agent_version}: {path}")
    print(f"Headers: {', '.join(headers)}")

    for metric_name, aliases, threshold in CHECKS[kind]:
        column = find_column(headers, aliases)
        if not column:
            raise ValueError(
                f"Cannot determine column for metric '{metric_name}'. "
                f"Expected one of: {', '.join(aliases)}. "
                f"Available headers: {', '.join(headers)}"
            )
        value = parse_metric(row.get(column), metric_name, column)
        status = "PASS" if value + EPSILON >= threshold else "FAIL"
        print(f"{status} {metric_name}: {value:.4f} >= {threshold:.4f} (column: {column})")
        if value + EPSILON < threshold:
            failures.append((metric_name, value, threshold, column))

    return failures


def parse_args():
    parser = argparse.ArgumentParser(description="Check Agent 2.5 eval summary metrics against CI thresholds.")
    parser.add_argument("--intent-summary", default=DEFAULT_INTENT_SUMMARY)
    parser.add_argument("--evidence-summary", default=DEFAULT_EVIDENCE_SUMMARY)
    parser.add_argument("--agent-version", default=DEFAULT_AGENT_VERSION)
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        failures = []
        failures.extend(run_checks("intent", args.intent_summary, args.agent_version))
        failures.extend(run_checks("evidence", args.evidence_summary, args.agent_version))
    except Exception as exc:
        print(f"\nThreshold check error: {exc}", file=sys.stderr)
        sys.exit(2)

    if failures:
        print("\nEval threshold check failed:")
        for metric_name, value, threshold, column in failures:
            print(f"- {metric_name} from '{column}' = {value:.4f}, threshold = {threshold:.4f}")
        sys.exit(1)

    print("\nEval threshold check passed.")


if __name__ == "__main__":
    main()
