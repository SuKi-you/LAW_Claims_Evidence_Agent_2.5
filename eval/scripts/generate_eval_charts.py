#!/usr/bin/env python3
import csv
import struct
import zlib
from pathlib import Path


OUTPUT_DIR = Path("eval/charts")
INTENT_SUMMARY = Path("eval/outputs/intent_eval_summary_v2.csv")
EVIDENCE_SUMMARY = Path("eval/outputs/evidence_eval_summary.csv")


FONT = {
    " ": ["000", "000", "000", "000", "000", "000", "000"],
    ".": ["0", "0", "0", "0", "0", "0", "1"],
    "%": ["10001", "00010", "00100", "01000", "10000", "00000", "00000"],
    "-": ["000", "000", "000", "111", "000", "000", "000"],
    ":": ["0", "1", "0", "0", "1", "0", "0"],
    "0": ["111", "101", "101", "101", "101", "101", "111"],
    "1": ["010", "110", "010", "010", "010", "010", "111"],
    "2": ["111", "001", "001", "111", "100", "100", "111"],
    "3": ["111", "001", "001", "111", "001", "001", "111"],
    "4": ["101", "101", "101", "111", "001", "001", "001"],
    "5": ["111", "100", "100", "111", "001", "001", "111"],
    "6": ["111", "100", "100", "111", "101", "101", "111"],
    "7": ["111", "001", "001", "010", "010", "100", "100"],
    "8": ["111", "101", "101", "111", "101", "101", "111"],
    "9": ["111", "101", "101", "111", "001", "001", "111"],
    "A": ["010", "101", "101", "111", "101", "101", "101"],
    "B": ["110", "101", "101", "110", "101", "101", "110"],
    "C": ["011", "100", "100", "100", "100", "100", "011"],
    "D": ["110", "101", "101", "101", "101", "101", "110"],
    "E": ["111", "100", "100", "110", "100", "100", "111"],
    "F": ["111", "100", "100", "110", "100", "100", "100"],
    "G": ["011", "100", "100", "101", "101", "101", "011"],
    "H": ["101", "101", "101", "111", "101", "101", "101"],
    "I": ["111", "010", "010", "010", "010", "010", "111"],
    "L": ["100", "100", "100", "100", "100", "100", "111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["1001", "1101", "1011", "1001", "1001", "1001", "1001"],
    "O": ["111", "101", "101", "101", "101", "101", "111"],
    "P": ["110", "101", "101", "110", "100", "100", "100"],
    "R": ["110", "101", "101", "110", "101", "101", "101"],
    "S": ["111", "100", "100", "111", "001", "001", "111"],
    "T": ["111", "010", "010", "010", "010", "010", "010"],
    "U": ["101", "101", "101", "101", "101", "101", "111"],
    "V": ["101", "101", "101", "101", "101", "101", "010"],
    "Y": ["101", "101", "101", "010", "010", "010", "010"],
}


def read_summary(path):
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def make_canvas(width, height, color=(255, 255, 255)):
    return [[color for _ in range(width)] for _ in range(height)]


def rect(canvas, x, y, w, h, color):
    height = len(canvas)
    width = len(canvas[0])
    for yy in range(max(0, y), min(height, y + h)):
        for xx in range(max(0, x), min(width, x + w)):
            canvas[yy][xx] = color


def line(canvas, x1, y1, x2, y2, color):
    if x1 == x2:
        rect(canvas, x1, min(y1, y2), 1, abs(y2 - y1) + 1, color)
    elif y1 == y2:
        rect(canvas, min(x1, x2), y1, abs(x2 - x1) + 1, 1, color)


def text(canvas, x, y, message, color=(35, 43, 55), scale=2):
    cx = x
    for char in message.upper():
        pattern = FONT.get(char, FONT[" "])
        for row_index, row in enumerate(pattern):
            for col_index, pixel in enumerate(row):
                if pixel == "1":
                    rect(canvas, cx + col_index * scale, y + row_index * scale, scale, scale, color)
        cx += (max(len(row) for row in pattern) + 1) * scale


def save_png(canvas, path):
    height = len(canvas)
    width = len(canvas[0])
    raw = b"".join(b"\x00" + b"".join(bytes(pixel) for pixel in row) for row in canvas)

    def chunk(kind, data):
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def metric_value(row, key):
    return max(0.0, min(1.0, float(row[key])))


def grouped_chart(rows, metrics, title, output_path):
    width, height = 920, 520
    canvas = make_canvas(width, height)
    margin_left, margin_right, margin_top, margin_bottom = 90, 40, 80, 90
    chart_w = width - margin_left - margin_right
    chart_h = height - margin_top - margin_bottom
    axis_color = (82, 94, 109)
    grid_color = (224, 230, 237)

    text(canvas, 32, 28, title, scale=3)
    for pct in [0, 25, 50, 75, 100]:
        y = margin_top + chart_h - int(chart_h * pct / 100)
        line(canvas, margin_left, y, width - margin_right, y, grid_color)
        text(canvas, 25, y - 8, f"{pct}%", scale=2)
    line(canvas, margin_left, margin_top, margin_left, margin_top + chart_h, axis_color)
    line(canvas, margin_left, margin_top + chart_h, width - margin_right, margin_top + chart_h, axis_color)

    group_w = chart_w // len(rows)
    bar_gap = 8
    bar_w = min(44, (group_w - 45) // len(metrics))
    for group_index, row in enumerate(rows):
        base_x = margin_left + group_index * group_w + 30
        for metric_index, metric in enumerate(metrics):
            key, label, color = metric
            value = metric_value(row, key)
            bar_h = int(chart_h * value)
            x = base_x + metric_index * (bar_w + bar_gap)
            y = margin_top + chart_h - bar_h
            rect(canvas, x, y, bar_w, bar_h, color)
            text(canvas, x - 2, y - 20, f"{int(round(value * 100))}%", scale=1)
        text(canvas, base_x + 12, margin_top + chart_h + 24, f"AGENT {row['agent_version']}", scale=2)

    legend_x = margin_left
    legend_y = height - 34
    for key, label, color in metrics:
        rect(canvas, legend_x, legend_y, 18, 18, color)
        text(canvas, legend_x + 28, legend_y + 2, label, scale=2)
        legend_x += 190

    save_png(canvas, output_path)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    intent_rows = read_summary(INTENT_SUMMARY)
    evidence_rows = read_summary(EVIDENCE_SUMMARY)

    grouped_chart(
        intent_rows,
        [
            ("avg_core_recall", "CORE", (35, 126, 184)),
            ("avg_precision", "PRECISION", (51, 160, 96)),
            ("avg_robustness", "ROBUST", (224, 127, 50)),
        ],
        "INTENT THREE METRICS",
        OUTPUT_DIR / "intent_three_metrics_comparison_cn_pct.png",
    )
    grouped_chart(
        evidence_rows,
        [
            ("avg_core_recall", "CORE", (35, 126, 184)),
            ("avg_robustness", "ROBUST", (224, 127, 50)),
            ("avg_evidence_score", "SCORE", (51, 160, 96)),
        ],
        "EVIDENCE THREE METRICS",
        OUTPUT_DIR / "evidence_three_metrics_comparison_cn_pct.png",
    )
    grouped_chart(
        evidence_rows,
        [("overall_pass_rate", "PASS RATE", (95, 80, 150))],
        "EVIDENCE OVERALL PASS RATE",
        OUTPUT_DIR / "evidence_overall_pass_rate_cn_pct.png",
    )
    print(f"Charts written to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
