#!/usr/bin/env python3  # 指定脚本使用 Python 3 运行

import argparse  # 导入 argparse，用于解析命令行参数
import csv  # 导入 csv，用于生成 CSV 评估结果
import json  # 导入 json，用于读取 cases 和解析 Agent 输出
import subprocess  # 导入 subprocess，用于调用本地 Agent adapter 命令
import sys  # 导入 sys，用于脚本异常退出
from pathlib import Path  # 导入 Path，用于处理文件路径
from typing import Any, Dict, List  # 导入类型注解，提升脚本可读性


DEFAULT_AGENT_VERSIONS = ["2.0", "2.5", "3.0"]  # 默认测试的 Agent 版本列表


def load_json_file(file_path: str) -> Dict[str, Any]:  # 定义函数：读取 JSON 文件
    path = Path(file_path)  # 将字符串路径转换为 Path 对象
    if not path.exists():  # 判断文件是否存在
        raise FileNotFoundError(f"找不到文件：{file_path}")  # 文件不存在时抛出错误
    with path.open("r", encoding="utf-8") as f:  # 使用 UTF-8 编码打开文件
        return json.load(f)  # 解析 JSON 并返回字典


def normalize_text(value: Any) -> str:  # 定义函数：把任意值转换为标准字符串
    if value is None:  # 如果值是 None
        return ""  # 返回空字符串
    return str(value).strip()  # 转成字符串并去掉首尾空白


def normalize_claim_name(value: Any) -> str:  # 定义函数：统一诉求名称写法
    text = normalize_text(value)  # 先把输入值转换成干净字符串
    if text in {"家暴", "保护令", "人身安全保护令", "家暴保护令"}:  # 如果是家暴/保护令的不同写法
        return "家暴 / 人身安全保护"  # 统一为标准诉求名称
    if text in {"抚养权", "孩子抚养权", "争取抚养权"}:  # 如果是抚养权的简称或口语写法
        return "子女抚养权"  # 统一为标准诉求名称
    if text in {"返还彩礼", "退彩礼", "要回彩礼"}:  # 如果是彩礼返还的不同写法
        return "彩礼返还"  # 统一为标准诉求名称
    if text in {"第三者赠与返还", "追回小三转账", "追回小三赠与"}:  # 如果是追回第三者赠与的不同写法
        return "追回第三者赠与"  # 统一为标准诉求名称
    if text in {"确认亲子关系", "否认亲子关系", "亲子关系确认", "亲子关系否认"}:  # 如果是亲子关系确认/否认的不同写法
        return "亲子关系确认/否认"  # 统一为标准诉求名称
    return text  # 其他诉求保持原名称


def is_high_confidence(confidence: Any) -> bool:  # 定义函数：判断输出是否为高置信
    if isinstance(confidence, (int, float)):  # 如果置信度是数字
        return confidence >= 0.8  # 大于等于 0.8 视为高置信
    text = normalize_text(confidence).lower()  # 将置信度转成小写字符串
    return text in {"high", "高", "高置信", "高置信度"}  # 这些文本都视为高置信


def extract_claims_from_output(agent_output: Dict[str, Any]) -> List[Dict[str, Any]]:  # 定义函数：从 Agent 输出中提取诉求
    candidate_keys = ["claims", "possible_claims", "intent_claims", "claims_detected", "detected_claims"]  # 定义常见诉求字段名
    raw_claims = []  # 初始化原始诉求列表
    for key in candidate_keys:  # 遍历可能的字段名
        if key in agent_output:  # 如果输出中存在该字段
            raw_claims = agent_output.get(key) or []  # 读取该字段内容
            break  # 找到第一个可用字段后停止
    if isinstance(raw_claims, str):  # 如果诉求字段是单个字符串
        raw_claims = [raw_claims]  # 包装成列表
    normalized_claims = []  # 初始化标准化诉求列表
    for item in raw_claims:  # 遍历原始诉求项
        if isinstance(item, str):  # 如果诉求项是字符串
            normalized_claims.append({"claim": normalize_claim_name(item), "confidence": "high"})  # 字符串诉求默认按高置信处理
        elif isinstance(item, dict):  # 如果诉求项是字典
            claim_name = item.get("claim") or item.get("type") or item.get("name") or item.get("label")  # 读取诉求名称字段
            confidence = item.get("confidence") or item.get("confidence_level") or item.get("score")  # 读取置信度字段
            normalized_claims.append({"claim": normalize_claim_name(claim_name), "confidence": confidence})  # 加入标准化结果
    return [claim for claim in normalized_claims if claim.get("claim")]  # 过滤空诉求并返回


def call_agent_command(command: List[str], payload: Dict[str, Any]) -> Dict[str, Any]:  # 定义函数：调用一个 Agent adapter
    command = list(command)  # 复制命令，避免修改配置对象
    if command and command[0] in {"python", "python3"}:  # 让 adapter 使用当前 Eval 脚本的 Python 解释器
        command[0] = sys.executable
    completed = subprocess.run(command, input=json.dumps(payload, ensure_ascii=False), text=True, capture_output=True, check=False)  # 把 payload 作为 stdin 传给 adapter
    if completed.returncode != 0:  # 如果 adapter 执行失败
        raise RuntimeError(f"Agent 命令执行失败：{command}\nSTDERR:\n{completed.stderr}")  # 抛出包含 stderr 的错误
    stdout = completed.stdout.strip()  # 获取 adapter 的 stdout 输出
    if not stdout:  # 如果 adapter 没有输出内容
        raise ValueError(f"Agent 命令没有输出 JSON：{command}")  # 抛出无输出错误
    return json.loads(stdout)  # 把 stdout 解析为 JSON 并返回


def load_agent_config(config_path: str) -> Dict[str, List[str]]:  # 定义函数：读取 Agent 命令配置
    config = load_json_file(config_path)  # 读取配置 JSON 文件
    agents = config.get("agents", {})  # 获取 agents 配置对象
    if not isinstance(agents, dict):  # 如果 agents 不是字典
        raise ValueError("配置文件中的 agents 必须是对象。")  # 抛出配置格式错误
    parsed_config = {}  # 初始化解析后的配置
    for version, command in agents.items():  # 遍历每个版本和对应命令
        if isinstance(command, str):  # 如果命令是字符串
            parsed_config[version] = command.split()  # 简单按空格拆分命令
        elif isinstance(command, list):  # 如果命令已经是列表
            parsed_config[version] = [str(part) for part in command]  # 确保每个命令片段都是字符串
        else:  # 如果命令格式不合法
            raise ValueError(f"版本 {version} 的命令必须是字符串或列表。")  # 抛出配置错误
    return parsed_config  # 返回解析后的配置


def evaluate_intent_case(case: Dict[str, Any], claims: List[Dict[str, Any]]) -> Dict[str, Any]:  # 定义函数：评估单条 Intent case
    expected = {normalize_claim_name(x) for x in case.get("expected_intent_claims", [])}  # 获取应识别诉求集合
    disallowed_high = {normalize_claim_name(x) for x in case.get("disallowed_high_confidence_intent_claims", [])}  # 获取不允许高置信输出的诉求集合
    detected = {normalize_claim_name(x.get("claim")) for x in claims}  # 获取 Agent 实际输出诉求集合
    high_detected = {normalize_claim_name(x.get("claim")) for x in claims if is_high_confidence(x.get("confidence"))}  # 获取 Agent 高置信输出诉求集合
    matched_expected = sorted(expected & detected)  # 计算命中的应识别诉求
    missed_expected = sorted(expected - detected)  # 计算漏掉的应识别诉求
    extra_claims = sorted(detected - expected)  # 计算超出 expected 的额外输出诉求
    high_conf_violations = sorted(disallowed_high & high_detected)  # 计算不允许但被高置信输出的诉求
    core_recall = len(matched_expected) / len(expected) if expected else 1.0  # 核心诉求召回率：命中 expected 数 / expected 总数
    precision = len(matched_expected) / len(detected) if detected else 0.0  # 诉求精确率：命中 expected 数 / 实际输出诉求总数
    robustness = 1 - (len(high_conf_violations) / len(disallowed_high)) if disallowed_high else 1.0  # 稳健性：1 - 高置信违规数 / 不允许高置信总数
    intent_score = (0.4 * core_recall) + (0.4 * precision) + (0.2 * robustness)  # 综合 Intent 分：召回 40% + 精确 40% + 稳健 20%
    pass_core_recall = core_recall == 1.0  # 判断核心诉求是否全部召回
    pass_precision = precision == 1.0  # 判断是否没有额外输出诉求
    pass_robustness = len(high_conf_violations) == 0  # 判断是否没有高置信违规输出
    return {  # 返回单条 case 评估结果
        "case_id": case.get("case_id"),  # case 编号
        "case_type": case.get("case_type"),  # case 类型
        "query": case.get("query"),  # 用户输入
        "expected_intent_claims": "|".join(sorted(expected)),  # 应识别诉求
        "detected_claims": "|".join(sorted(detected)),  # 实际输出诉求
        "high_confidence_claims": "|".join(sorted(high_detected)),  # 高置信输出诉求
        "matched_expected": "|".join(matched_expected),  # 命中的 expected 诉求
        "missed_expected": "|".join(missed_expected),  # 漏掉的 expected 诉求
        "extra_claims": "|".join(extra_claims),  # 额外输出诉求
        "extra_claim_count": len(extra_claims),  # 额外输出诉求数量
        "high_conf_violations": "|".join(high_conf_violations),  # 高置信违规诉求
        "high_conf_violation_count": len(high_conf_violations),  # 高置信违规诉求数量
        "core_recall": round(core_recall, 4),  # 核心诉求召回率
        "precision": round(precision, 4),  # 诉求精确率
        "robustness": round(robustness, 4),  # 高置信稳健性
        "intent_score": round(intent_score, 4),  # 综合 Intent 分
        "pass_core_recall": pass_core_recall,  # 核心召回是否通过
        "pass_precision": pass_precision,  # 精确率是否通过
        "pass_robustness": pass_robustness,  # 稳健性是否通过
        "pass_overall": pass_core_recall and pass_precision and pass_robustness,  # 是否整体通过
    }  # 结束返回


def summarize_results(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:  # 定义函数：按版本汇总结果
    versions = sorted({row["agent_version"] for row in rows})  # 提取所有 Agent 版本
    summary = []  # 初始化汇总列表
    for version in versions:  # 遍历每个 Agent 版本
        version_rows = [row for row in rows if row["agent_version"] == version]  # 筛选该版本结果
        total = len(version_rows)  # 计算该版本 case 数
        avg_core_recall = sum(float(row["core_recall"]) for row in version_rows) / total if total else 0.0  # 计算平均核心召回率
        avg_precision = sum(float(row["precision"]) for row in version_rows) / total if total else 0.0  # 计算平均精确率
        avg_robustness = sum(float(row["robustness"]) for row in version_rows) / total if total else 0.0  # 计算平均稳健性
        avg_intent_score = sum(float(row["intent_score"]) for row in version_rows) / total if total else 0.0  # 计算平均综合 Intent 分
        avg_extra_claim_count = sum(int(row["extra_claim_count"]) for row in version_rows) / total if total else 0.0  # 计算平均额外诉求数
        avg_high_conf_violation_count = sum(int(row["high_conf_violation_count"]) for row in version_rows) / total if total else 0.0  # 计算平均高置信违规数
        pass_core_recall_count = sum(1 for row in version_rows if row["pass_core_recall"])  # 统计核心召回通过数量
        pass_precision_count = sum(1 for row in version_rows if row["pass_precision"])  # 统计精确率通过数量
        pass_robustness_count = sum(1 for row in version_rows if row["pass_robustness"])  # 统计稳健性通过数量
        pass_overall_count = sum(1 for row in version_rows if row["pass_overall"])  # 统计整体通过数量
        summary.append({  # 添加该版本汇总
            "agent_version": version,  # Agent 版本
            "case_count": total,  # case 总数
            "avg_core_recall": round(avg_core_recall, 4),  # 平均核心召回率
            "avg_precision": round(avg_precision, 4),  # 平均精确率
            "avg_robustness": round(avg_robustness, 4),  # 平均稳健性
            "avg_intent_score": round(avg_intent_score, 4),  # 平均综合 Intent 分
            "avg_extra_claim_count": round(avg_extra_claim_count, 4),  # 平均额外诉求数
            "avg_high_conf_violation_count": round(avg_high_conf_violation_count, 4),  # 平均高置信违规数
            "core_recall_pass_rate": round(pass_core_recall_count / total, 4) if total else 0.0,  # 核心召回通过率
            "precision_pass_rate": round(pass_precision_count / total, 4) if total else 0.0,  # 精确率通过率
            "robustness_pass_rate": round(pass_robustness_count / total, 4) if total else 0.0,  # 稳健性通过率
            "overall_pass_rate": round(pass_overall_count / total, 4) if total else 0.0,  # 整体通过率
        })  # 结束该版本汇总
    return summary  # 返回汇总结果


def write_csv(file_path: str, rows: List[Dict[str, Any]]) -> None:  # 定义函数：写入 CSV 文件
    if not rows:  # 如果没有结果
        return  # 直接返回
    path = Path(file_path)  # 转换输出路径
    path.parent.mkdir(parents=True, exist_ok=True)  # 确保输出目录存在
    with path.open("w", encoding="utf-8-sig", newline="") as f:  # 使用 UTF-8 BOM，方便 Excel 正常显示中文
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))  # 创建 CSV 写入器
        writer.writeheader()  # 写入表头
        writer.writerows(rows)  # 写入所有数据行


def write_markdown_summary(file_path: str, summary: List[Dict[str, Any]]) -> None:  # 定义函数：写入 Markdown 汇总报告
    path = Path(file_path)  # 转换输出路径
    path.parent.mkdir(parents=True, exist_ok=True)  # 确保输出目录存在
    lines = []  # 初始化 Markdown 行列表
    lines.append("# Agent Intent Golden Cases 评估报告")  # 添加标题
    lines.append("")  # 添加空行
    lines.append("本报告只评估 Intent 层，不评估 Evidence、Risk、RAG 或 JSON Schema。")  # 添加评估范围说明
    lines.append("")  # 添加空行
    lines.append("## 指标说明")  # 添加指标说明标题
    lines.append("")  # 添加空行
    lines.append("- Core Recall：核心诉求召回率，衡量该识别的诉求有没有识别出来。")  # 说明 Core Recall
    lines.append("- Precision：诉求精确率，衡量输出诉求中有多少是 expected_intent_claims。")  # 说明 Precision
    lines.append("- Robustness：高置信稳健性，衡量不该高置信输出的诉求有没有被高置信乱输出。")  # 说明 Robustness
    lines.append("- Intent Score：0.4 × Core Recall + 0.4 × Precision + 0.2 × Robustness。")  # 说明综合分
    lines.append("")  # 添加空行
    lines.append("## 版本汇总")  # 添加版本汇总标题
    lines.append("")  # 添加空行
    lines.append("| Agent 版本 | Case 数 | Core Recall | Precision | Robustness | Intent Score | 平均额外诉求数 | 平均高置信违规数 | 整体通过率 |")  # 添加表头
    lines.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|")  # 添加表格分隔线
    for row in summary:  # 遍历每个版本汇总
        lines.append(f"| {row['agent_version']} | {row['case_count']} | {row['avg_core_recall']} | {row['avg_precision']} | {row['avg_robustness']} | {row['avg_intent_score']} | {row['avg_extra_claim_count']} | {row['avg_high_conf_violation_count']} | {row['overall_pass_rate']} |")  # 写入表格行
    path.write_text("\n".join(lines), encoding="utf-8")  # 以 UTF-8 写入 Markdown 文件


def run_eval(args: argparse.Namespace) -> None:  # 定义函数：执行完整评估流程
    cases_data = load_json_file(args.cases)  # 读取 golden cases 文件
    cases = cases_data.get("cases", [])  # 获取 cases 列表
    if not cases:  # 如果 cases 为空
        raise ValueError("cases 文件中没有可测试的 cases。")  # 抛出错误
    agent_config = load_agent_config(args.config)  # 读取 Agent 调用配置
    all_rows = []  # 初始化逐条评估结果列表
    for version in args.versions:  # 遍历需要测试的版本
        if version not in agent_config:  # 如果配置里没有该版本
            raise ValueError(f"配置文件中缺少 Agent {version} 的调用命令。")  # 抛出缺失配置错误
        command = agent_config[version]  # 读取该版本调用命令
        for case in cases:  # 遍历每条 case
            payload = {"query": case.get("query"), "confirmed_claims": case.get("confirmed_claims", []), "case_id": case.get("case_id")}  # 构造传给 Agent 的输入
            try:  # 捕获单条 case 执行异常
                agent_output = call_agent_command(command, payload)  # 调用 Agent adapter 获取输出
                extracted_claims = extract_claims_from_output(agent_output)  # 从输出中提取诉求
                result = evaluate_intent_case(case, extracted_claims)  # 计算单条 case 指标
                result["agent_version"] = version  # 写入 Agent 版本
                result["error"] = ""  # 没有错误时写入空错误字段
            except Exception as exc:  # 如果单条 case 执行失败
                expected_text = "|".join(case.get("expected_intent_claims", []))  # 获取 expected 文本
                result = {"agent_version": version, "case_id": case.get("case_id"), "case_type": case.get("case_type"), "query": case.get("query"), "expected_intent_claims": expected_text, "detected_claims": "", "high_confidence_claims": "", "matched_expected": "", "missed_expected": expected_text, "extra_claims": "", "extra_claim_count": 0, "high_conf_violations": "", "high_conf_violation_count": 0, "core_recall": 0.0, "precision": 0.0, "robustness": 0.0, "intent_score": 0.0, "pass_core_recall": False, "pass_precision": False, "pass_robustness": False, "pass_overall": False, "error": str(exc)}  # 失败时记录为 0 分并保存错误
            all_rows.append(result)  # 把单条结果加入总结果
    summary = summarize_results(all_rows)  # 按版本汇总结果
    write_csv(args.detail_csv, all_rows)  # 输出逐条明细 CSV
    write_csv(args.summary_csv, summary)  # 输出汇总 CSV
    write_markdown_summary(args.summary_md, summary)  # 输出 Markdown 报告
    print(f"逐条明细已输出：{args.detail_csv}")  # 打印明细输出路径
    print(f"版本汇总已输出：{args.summary_csv}")  # 打印汇总输出路径
    print(f"Markdown 报告已输出：{args.summary_md}")  # 打印 Markdown 输出路径


def parse_args() -> argparse.Namespace:  # 定义函数：解析命令行参数
    parser = argparse.ArgumentParser(description="Run Intent-only golden cases eval with Core Recall, Precision, Robustness and Intent Score.")  # 创建参数解析器
    parser.add_argument("--cases", default="cases_intent_35.json", help="Intent golden cases JSON 文件路径。")  # 添加 cases 文件路径参数
    parser.add_argument("--config", default="eval_agents_config.json", help="Agent 版本调用命令配置 JSON 文件路径。")  # 添加配置文件路径参数
    parser.add_argument("--versions", nargs="+", default=DEFAULT_AGENT_VERSIONS, help="需要测试的 Agent 版本列表。")  # 添加版本列表参数
    parser.add_argument("--detail-csv", default="eval_outputs/intent_eval_detail_v2.csv", help="逐条 case 明细 CSV 输出路径。")  # 添加明细 CSV 输出参数
    parser.add_argument("--summary-csv", default="eval_outputs/intent_eval_summary_v2.csv", help="版本汇总 CSV 输出路径。")  # 添加汇总 CSV 输出参数
    parser.add_argument("--summary-md", default="eval_outputs/intent_eval_report_v2.md", help="Markdown 汇总报告输出路径。")  # 添加 Markdown 报告输出参数
    return parser.parse_args()  # 返回解析后的参数


if __name__ == "__main__":  # 判断当前脚本是否作为主程序运行
    try:  # 捕获顶层异常
        run_eval(parse_args())  # 解析参数并运行评估
    except Exception as exc:  # 如果出现异常
        print(f"Eval 执行失败：{exc}", file=sys.stderr)  # 将错误信息输出到 stderr
        sys.exit(1)  # 使用状态码 1 退出
