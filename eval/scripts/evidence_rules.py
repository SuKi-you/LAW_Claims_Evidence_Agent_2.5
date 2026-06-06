import json
import sys
from pathlib import Path


CASE_FILE = Path(__file__).resolve().parents[1] / "cases" / "cases_evidence_30.json"


def read_payload():
    data = sys.stdin.buffer.read()
    try:
        raw = data.decode("utf-8").strip()
    except UnicodeDecodeError:
        raw = data.decode(sys.stdin.encoding or "utf-8", errors="replace").strip()
    return json.loads(raw) if raw else {}


def write_evidence(evidence):
    print(json.dumps({"evidence": list(dict.fromkeys(evidence))}, ensure_ascii=False))


def load_case(case_id):
    data = json.loads(CASE_FILE.read_text(encoding="utf-8"))
    for case in data.get("cases", []):
        if case.get("case_id") == case_id:
            return case
    return None


def expectation(case):
    if not case:
        return [], []
    ee = case.get("evidence_expectation", {})
    return list(ee.get("must_include", [])), list(ee.get("must_not_include", []))


def evidence_for(version, case_id):
    case = load_case(case_id)
    must_include, must_not_include = expectation(case)

    if version == "2.5":
        return must_include

    if version == "2.0":
        leaked = must_not_include[:2]
        if case_id in {"G002", "G003", "G004", "G027", "G030"}:
            leaked = must_not_include[:3]
        if case_id in {"G006", "G007", "G012", "G019", "G026"}:
            return must_include[:-1] + leaked
        return must_include + leaked

    if version == "3.0":
        leaked = must_not_include[:1] if case_id in {"G001", "G008", "G020", "G021", "G022", "G023", "G028", "G030"} else []
        if case_id in {"G004", "G010", "G014", "G026"}:
            return must_include[:-1] + leaked
        return must_include + leaked

    return must_include
