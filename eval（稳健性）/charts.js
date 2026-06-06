#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function writePng(filePath, width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
}

function createCanvas(width, height) {
  const pixels = Buffer.alloc(width * height * 4, 255);
  function set(x, y, color) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (Math.floor(y) * width + Math.floor(x)) * 4;
    pixels[i] = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
    pixels[i + 3] = color[3] ?? 255;
  }
  function rect(x, y, w, h, color) {
    for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(height, Math.ceil(y + h)); yy++) {
      for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(width, Math.ceil(x + w)); xx++) set(xx, yy, color);
    }
  }
  function line(x1, y1, x2, y2, color) {
    const dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
    const dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
    let err = dx + dy, x = Math.floor(x1), y = Math.floor(y1);
    while (true) {
      set(x, y, color);
      if (x === Math.floor(x2) && y === Math.floor(y2)) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  return { width, height, pixels, rect, line };
}

const FONT = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "%": ["101", "001", "010", "100", "101"],
  ".": ["0", "0", "0", "0", "1"],
  "-": ["000", "000", "111", "000", "000"],
  " ": ["0", "0", "0", "0", "0"],
  "A": ["010", "101", "111", "101", "101"],
  "B": ["110", "101", "110", "101", "110"],
  "C": ["111", "100", "100", "100", "111"],
  "D": ["110", "101", "101", "101", "110"],
  "E": ["111", "100", "110", "100", "111"],
  "F": ["111", "100", "110", "100", "100"],
  "G": ["111", "100", "101", "101", "111"],
  "H": ["101", "101", "111", "101", "101"],
  "I": ["111", "010", "010", "010", "111"],
  "J": ["001", "001", "001", "101", "111"],
  "K": ["101", "101", "110", "101", "101"],
  "L": ["100", "100", "100", "100", "111"],
  "M": ["101", "111", "111", "101", "101"],
  "N": ["101", "111", "111", "111", "101"],
  "O": ["111", "101", "101", "101", "111"],
  "P": ["111", "101", "111", "100", "100"],
  "Q": ["111", "101", "101", "111", "001"],
  "R": ["111", "101", "111", "110", "101"],
  "S": ["111", "100", "111", "001", "111"],
  "T": ["111", "010", "010", "010", "010"],
  "U": ["101", "101", "101", "101", "111"],
  "V": ["101", "101", "101", "101", "010"],
  "W": ["101", "101", "111", "111", "101"],
  "X": ["101", "101", "010", "101", "101"],
  "Y": ["101", "101", "010", "010", "010"],
  "Z": ["111", "001", "010", "100", "111"],
  "_": ["000", "000", "000", "000", "111"],
  ":": ["0", "1", "0", "1", "0"],
};

function drawText(ctx, text, x, y, color = [40, 40, 40], scale = 2) {
  let cursor = x;
  const upper = String(text).toUpperCase();
  for (const char of upper) {
    const glyph = FONT[char] || FONT[" "];
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] === "1") ctx.rect(cursor + col * scale, y + row * scale, scale, scale, color);
      }
    }
    cursor += (glyph[0].length + 1) * scale;
  }
}

function chart(filePath, title, labels, values, options = {}) {
  const width = 900;
  const height = 520;
  const ctx = createCanvas(width, height);
  const margin = { left: 90, right: 40, top: 70, bottom: 105 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const max = options.max ?? Math.max(1, ...values);
  ctx.rect(0, 0, width, height, [255, 255, 255]);
  drawText(ctx, title, 36, 24, [20, 40, 70], 3);
  ctx.line(margin.left, margin.top, margin.left, margin.top + plotH, [50, 50, 50]);
  ctx.line(margin.left, margin.top + plotH, margin.left + plotW, margin.top + plotH, [50, 50, 50]);
  for (let i = 0; i <= 4; i++) {
    const y = margin.top + plotH - (plotH * i) / 4;
    ctx.line(margin.left - 4, y, margin.left + plotW, y, [225, 225, 225]);
    drawText(ctx, String(Math.round((max * i) / 4)), 22, y - 6, [90, 90, 90], 2);
  }
  const gap = 14;
  const barW = Math.max(12, (plotW - gap * (values.length + 1)) / values.length);
  values.forEach((value, i) => {
    const x = margin.left + gap + i * (barW + gap);
    const h = Math.max(0, (value / max) * plotH);
    const y = margin.top + plotH - h;
    ctx.rect(x, y, barW, h, options.color || [65, 105, 225]);
    drawText(ctx, options.percent ? `${Math.round(value)}%` : String(Math.round(value)), x, Math.max(78, y - 18), [30, 30, 30], 2);
    drawText(ctx, labels[i].slice(0, 14), x, margin.top + plotH + 15, [60, 60, 60], 2);
  });
  writePng(filePath, width, height, ctx.pixels);
}

function rate(items, field) {
  if (!items.length) return 0;
  return items.filter((item) => item.score?.[field] === true).length / items.length;
}

function byClaim(results) {
  const map = new Map();
  for (const item of results) {
    for (const claim of item.case.claim_types || []) {
      if (!map.has(claim)) map.set(claim, []);
      map.get(claim).push(item);
    }
  }
  return [...map.entries()].map(([claim_type, items]) => ({
    claim_type,
    case_count: items.length,
    overall_pass_rate: rate(items, "overall_pass"),
    average_score: items.reduce((sum, item) => sum + (item.score?.total_score || 0), 0) / items.length,
    evidence_scope_violation_count: items.filter((item) => item.score?.evidence_scope_pass === false).length,
  }));
}

export function createCharts(scoredResults, summary, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  chart(path.join(outDir, "overall_pass_rate.png"), "OVERALL PASS RATE", ["overall"], [summary.overall_pass_rate * 100], { max: 100, percent: true });
  chart(
    path.join(outDir, "module_pass_rate.png"),
    "MODULE PASS RATE",
    ["intent", "excluded", "evidence", "scope", "schema", "risk"],
    [
      summary.intent_pass_rate * 100,
      summary.excluded_claims_pass_rate * 100,
      summary.evidence_keywords_pass_rate * 100,
      summary.evidence_scope_pass_rate * 100,
      summary.json_schema_pass_rate * 100,
      summary.risk_tips_pass_rate * 100,
    ],
    { max: 100, percent: true }
  );
  const claimRows = byClaim(scoredResults);
  chart(path.join(outDir, "pass_rate_by_claim_type.png"), "PASS RATE BY CLAIM", claimRows.map((r) => r.claim_type), claimRows.map((r) => r.overall_pass_rate * 100), { max: 100, percent: true });
  chart(path.join(outDir, "evidence_scope_violation_count.png"), "SCOPE VIOLATIONS", claimRows.map((r) => r.claim_type), claimRows.map((r) => r.evidence_scope_violation_count), { max: Math.max(1, ...claimRows.map((r) => r.evidence_scope_violation_count)) });
  chart(path.join(outDir, "average_score_by_claim_type.png"), "AVG SCORE BY CLAIM", claimRows.map((r) => r.claim_type), claimRows.map((r) => r.average_score), { max: 100 });

  const errors = new Map();
  for (const item of scoredResults) {
    const key = item.score?.error_type || (item.error ? item.error.type || "error" : "none");
    errors.set(key, (errors.get(key) || 0) + 1);
  }
  chart(path.join(outDir, "error_type_distribution.png"), "ERROR TYPE DISTRIBUTION", [...errors.keys()], [...errors.values()], { max: Math.max(1, ...errors.values()) });

  const retrievalObserved = scoredResults.filter((item) => item.score?.retrieval_top3_hit !== "not_observed");
  if (retrievalObserved.length) {
    chart(path.join(outDir, "retrieval_topk_hit_rate.png"), "RETRIEVAL TOP3 HIT", ["top3"], [rate(retrievalObserved, "retrieval_top3_hit") * 100], { max: 100, percent: true });
  }
  const cleanerObserved = scoredResults.filter((item) => item.score?.query_cleaner_pass !== "not_observed");
  if (cleanerObserved.length) {
    chart(path.join(outDir, "query_cleaner_pass_rate.png"), "QUERY CLEANER PASS", ["cleaner"], [rate(cleanerObserved, "query_cleaner_pass") * 100], { max: 100, percent: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const versionIndex = process.argv.indexOf("--version");
  const version = versionIndex >= 0 ? process.argv[versionIndex + 1] || "baseline" : "baseline";
  const reportDir = path.join(ROOT, "eval", "reports", version);
  const rawPath = path.join(reportDir, "raw_results.json");
  const summaryPath = path.join(reportDir, `${version}_summary.json`);
  const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  createCharts(raw.results, summary, path.join(reportDir, "charts"));
  console.log(`Charts written to ${path.join(reportDir, "charts")}`);
}
