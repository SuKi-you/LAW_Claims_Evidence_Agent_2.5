import argparse

from evidence_rules import evidence_for, read_payload as read_evidence_payload, write_evidence
from intent_rules import (
    detect_v20,
    detect_v25,
    detect_v30,
    read_payload as read_intent_payload,
    write_claims,
)


INTENT_DETECTORS = {
    "2.0": detect_v20,
    "2.5": detect_v25,
    "3.0": detect_v30,
}


def main(version):
    parser = argparse.ArgumentParser(description=f"Offline eval adapter for Agent {version}.")
    parser.add_argument("--mode", choices=["intent", "evidence"], required=True)
    args = parser.parse_args()

    if args.mode == "intent":
        payload = read_intent_payload()
        write_claims(INTENT_DETECTORS[version](payload.get("query", "")))
        return

    payload = read_evidence_payload()
    write_evidence(evidence_for(version, payload.get("case_id", "")))
