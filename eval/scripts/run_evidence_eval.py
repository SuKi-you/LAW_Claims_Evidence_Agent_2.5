#!/usr/bin/env python3
# Evidence Eval script (30 Evidence Golden Cases), full comments included

import json
import csv
import argparse
import subprocess
import sys
from pathlib import Path
from typing import List, Dict, Any

DEFAULT_AGENT_VERSIONS = ["2.0","2.5","3.0"]

def load_json_file(file_path: str) -> Dict[str, Any]:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"找不到文件：{file_path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)

def evaluate_case(case: Dict[str, Any], agent_output: Dict[str, Any]) -> Dict[str, Any]:
    ee = case.get("evidence_expectation", {})
    must_include = set(ee.get("must_include", []))
    must_not_include = set(ee.get("must_not_include", []))
    output_evidence = set(agent_output.get("evidence", []))
    matched_must_include = must_include & output_evidence
    violated_must_not_include = must_not_include & output_evidence
    core_recall = len(matched_must_include)/len(must_include) if must_include else 1.0
    robustness = 1 - len(violated_must_not_include)/len(must_not_include) if must_not_include else 1.0
    evidence_score = 0.5 * core_recall + 0.5 * robustness
    return {
        "case_id": case.get("case_id"),
        "query": case.get("query"),
        "confirmed_claims": "|".join(case.get("confirmed_claims", [])),
        "matched_must_include": "|".join(matched_must_include),
        "violated_must_not_include": "|".join(violated_must_not_include),
        "core_recall": round(core_recall,4),
        "robustness": round(robustness,4),
        "evidence_score": round(evidence_score,4),
        "pass_core_recall": core_recall==1.0,
        "pass_robustness": robustness==1.0,
        "pass_overall": core_recall==1.0 and robustness==1.0
    }

def call_agent_command(command: List[str], payload: Dict[str, Any]) -> Dict[str, Any]:
    command = list(command)
    if command and command[0] in {"python", "python3"}:
        command[0] = sys.executable
    completed = subprocess.run(command, input=json.dumps(payload, ensure_ascii=False), text=True, capture_output=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"Agent 命令执行失败：{command}\nSTDERR:\n{completed.stderr}")
    stdout = completed.stdout.strip()
    if not stdout:
        raise ValueError(f"Agent 命令没有输出 JSON：{command}")
    return json.loads(stdout)

def load_agent_config(config_path: str) -> Dict[str, List[str]]:
    config = load_json_file(config_path)
    agents = config.get("agents", {})
    parsed_config = {}
    for version, command in agents.items():
        if isinstance(command,str):
            parsed_config[version] = command.split()
        elif isinstance(command,list):
            parsed_config[version] = [str(c) for c in command]
        else:
            raise ValueError(f"版本 {version} 的命令必须是字符串或列表")
    return parsed_config

def run_eval(args):
    cases_data = load_json_file(args.cases)
    cases = cases_data.get("cases", [])
    if not cases:
        raise ValueError("cases 文件中没有可测试的 cases。")
    agent_config = load_agent_config(args.config)
    all_rows = []
    for version in args.versions:
        if version not in agent_config:
            raise ValueError(f"配置文件中缺少 Agent {version} 的调用命令")
        command = agent_config[version]
        for case in cases:
            payload = {"query": case.get("query"), "confirmed_claims": case.get("confirmed_claims",[]),"case_id":case.get("case_id")}
            try:
                agent_output = call_agent_command(command, payload)
                result = evaluate_case(case, agent_output)
                result["agent_version"] = version
                result["error"] = ""
            except Exception as exc:
                result = {"case_id": case.get("case_id"), "agent_version": version, "error": str(exc)}
            all_rows.append(result)
    summary = []
    for version in args.versions:
        rows = [r for r in all_rows if r.get("agent_version")==version and "core_recall" in r]
        total = len(rows)
        avg_core = sum(r["core_recall"] for r in rows)/total if total else 0
        avg_robust = sum(r["robustness"] for r in rows)/total if total else 0
        avg_score = sum(r["evidence_score"] for r in rows)/total if total else 0
        pass_overall_count = sum(1 for r in rows if r["pass_overall"])
        summary.append({
            "agent_version": version,
            "case_count": total,
            "avg_core_recall": round(avg_core,4),
            "avg_robustness": round(avg_robust,4),
            "avg_evidence_score": round(avg_score,4),
            "overall_pass_rate": round(pass_overall_count/total,4) if total else 0.0
        })
    Path(args.detail_csv).parent.mkdir(exist_ok=True,parents=True)
    with open(args.detail_csv,"w",encoding="utf-8-sig",newline="") as f:
        writer = csv.DictWriter(f,fieldnames=list(all_rows[0].keys()))
        writer.writeheader()
        writer.writerows(all_rows)
    with open(args.summary_csv,"w",encoding="utf-8-sig",newline="") as f:
        writer = csv.DictWriter(f,fieldnames=list(summary[0].keys()))
        writer.writeheader()
        writer.writerows(summary)
    md_lines = ["# Evidence Golden Cases Eval Report",""]
    md_lines.append("| Agent版本 | 案例数 | 核心证据命中率 | 稳健性 | 综合得分 | 整体通过率 |")
    md_lines.append("|---|---:|---:|---:|---:|---:|")
    for row in summary:
        md_lines.append(f"| {row['agent_version']} | {row['case_count']} | {row['avg_core_recall']} | {row['avg_robustness']} | {row['avg_evidence_score']} | {row['overall_pass_rate']} |")
    Path(args.summary_md).write_text("\n".join(md_lines),encoding="utf-8")
    print(f"明细 CSV: {args.detail_csv}")
    print(f"汇总 CSV: {args.summary_csv}")
    print(f"Markdown报告: {args.summary_md}")

def parse_args():
    parser = argparse.ArgumentParser(description="Run Evidence-only golden cases eval for Agent 2.0/2.5/3.0")
    parser.add_argument("--cases",default="cases_evidence_30.json")
    parser.add_argument("--config",default="eval_agents_config.json")
    parser.add_argument("--versions",nargs="+",default=DEFAULT_AGENT_VERSIONS)
    parser.add_argument("--detail-csv",default="eval_outputs/evidence_eval_detail.csv")
    parser.add_argument("--summary-csv",default="eval_outputs/evidence_eval_summary.csv")
    parser.add_argument("--summary-md",default="eval_outputs/evidence_eval_report.md")
    return parser.parse_args()

if __name__=="__main__":
    try:
        run_eval(parse_args())
    except Exception as e:
        print(f"Evidence Eval 执行失败: {e}",file=sys.stderr)
        sys.exit(1)
