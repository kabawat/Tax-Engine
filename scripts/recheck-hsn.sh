#!/usr/bin/env bash
set -euo pipefail

# ANSI color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo -e "${BOLD}${CYAN}====================================================${NC}"
echo -e "${BOLD}${CYAN}       HSN Dataset Comprehensive Recheck Tool       ${NC}"
echo -e "${BOLD}${CYAN}====================================================${NC}"

# 1. Dataset Integrity and Schema Recheck via Node.js
echo -e "\n${BOLD}[1/3] Scanning and validating all HSN chapter files...${NC}"

node -e '
const fs = require("node:fs");
const path = require("node:path");

const HSN_DIR = path.join(process.cwd(), "src/countries/IN/schedules/hsn");
const META_FILE = path.join(process.cwd(), "src/countries/IN/schedules/meta.json");

const VALID_TAXABILITIES = new Set([
  "TAXABLE",
  "EXEMPT",
  "NIL_RATED",
  "NON_GST",
  "ZERO_RATED"
]);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const files = fs.readdirSync(HSN_DIR)
  .filter(f => f.startsWith("ch-") && f.endsWith(".json"))
  .sort();

if (files.length === 0) {
  console.error("\x1b[31mError: No chapter files found in " + HSN_DIR + "\x1b[0m");
  process.exit(1);
}

const allCodes = new Set();
let totalEntries = 0;
let multiPeriodCount = 0;
const errors = [];

function dayBefore(isoDate) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

for (const file of files) {
  const filePath = path.join(HSN_DIR, file);
  let content;
  try {
    content = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    errors.push(file + ": Invalid JSON: " + err.message);
    continue;
  }

  const { chapter, kind, count, entries } = content;

  if (typeof chapter !== "string" || chapter.length !== 2) {
    errors.push(file + ": Invalid chapter field: " + chapter);
  }
  if (kind !== "HSN") {
    errors.push(file + ": Invalid kind field (expected HSN): " + kind);
  }
  if (!Array.isArray(entries)) {
    errors.push(file + ": entries is not an array");
    continue;
  }
  if (entries.length !== count) {
    errors.push(file + ": Header count (" + count + ") does not match actual entries length (" + entries.length + ")");
  }

  const chapterCodes = new Set();

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    const { code, description, rateHistory } = entry;

    // Check code type and prefix
    if (typeof code !== "string" || !code.trim()) {
      errors.push(file + "[" + idx + "]: Invalid code (must be non-empty string)");
      continue;
    }

    if (code.slice(0, 2) !== chapter) {
      errors.push(file + ": Code " + code + " prefix does not match chapter " + chapter);
    }

    // Check duplicates
    if (allCodes.has(code)) {
      errors.push("Cross-file duplicate HSN code: " + code + " in " + file);
    }
    if (chapterCodes.has(code)) {
      errors.push("Duplicate HSN code in same file " + file + ": " + code);
    }
    allCodes.add(code);
    chapterCodes.add(code);

    // Check description
    if (description !== undefined && typeof description !== "string") {
      errors.push(file + "[" + code + "]: description must be string");
    }

    // Check rate history
    if (!Array.isArray(rateHistory) || rateHistory.length === 0) {
      errors.push(file + "[" + code + "]: rateHistory required and must not be empty");
      continue;
    }

    if (rateHistory.length > 1) {
      multiPeriodCount++;
    }

    for (let pIdx = 0; pIdx < rateHistory.length; pIdx++) {
      const period = rateHistory[pIdx];
      const { ratePercent, taxability, effectiveFrom, effectiveTo } = period;

      if (typeof ratePercent !== "number" || !Number.isFinite(ratePercent) || ratePercent < 0) {
        errors.push(file + "[" + code + "]: Invalid ratePercent: " + ratePercent);
      }
      if (!VALID_TAXABILITIES.has(taxability)) {
        errors.push(file + "[" + code + "]: Invalid taxability: " + taxability);
      }
      if (!DATE_REGEX.test(effectiveFrom)) {
        errors.push(file + "[" + code + "]: Invalid effectiveFrom format: " + effectiveFrom);
      }
      if (effectiveTo !== null && !DATE_REGEX.test(effectiveTo)) {
        errors.push(file + "[" + code + "]: Invalid effectiveTo format: " + effectiveTo);
      }
      if (effectiveTo !== null && effectiveFrom > effectiveTo) {
        errors.push(file + "[" + code + "]: Inverted period: effectiveFrom " + effectiveFrom + " > effectiveTo " + effectiveTo);
      }

      // Period continuity and overlap check
      if (pIdx + 1 < rateHistory.length) {
        const nextPeriod = rateHistory[pIdx + 1];
        const expectedEffectiveTo = dayBefore(nextPeriod.effectiveFrom);
        if (effectiveTo !== expectedEffectiveTo) {
          errors.push(file + "[" + code + "]: Gap or overlap at period " + pIdx + ": effectiveTo=" + effectiveTo + " expected=" + expectedEffectiveTo);
        }
      } else {
        if (effectiveTo !== null) {
          errors.push(file + "[" + code + "]: Most recent period effectiveTo must be null, got: " + effectiveTo);
        }
      }
    }
  }

  totalEntries += entries.length;
}

// Validate meta.json + chapter coverage (01–98 present or excluded)
let meta;
try {
  meta = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
  if (meta.hsnCount !== totalEntries) {
    errors.push("meta.json hsnCount (" + meta.hsnCount + ") does not match total entries (" + totalEntries + ")");
  }
  if (!Array.isArray(meta.chapters) || meta.chapters.length !== files.length) {
    errors.push("meta.json chapters count mismatch: " + (meta.chapters ? meta.chapters.length : 0) + " vs " + files.length);
  }

  const presentChapters = new Set(
    files.map((f) => f.replace(/^ch-/, "").replace(/\.json$/, ""))
  );
  const metaChapters = new Set(Array.isArray(meta.chapters) ? meta.chapters : []);
  for (const ch of presentChapters) {
    if (!metaChapters.has(ch)) {
      errors.push("Chapter file ch-" + ch + ".json present but missing from meta.json chapters");
    }
  }
  for (const ch of metaChapters) {
    if (!presentChapters.has(ch)) {
      errors.push("meta.json lists chapter " + ch + " but ch-" + ch + ".json is missing");
    }
  }

  const excluded = Array.isArray(meta.excludedChapters) ? meta.excludedChapters : [];
  const excludedIds = new Set();
  for (const row of excluded) {
    const id = row && typeof row.chapter === "string" ? row.chapter : null;
    if (!id || !/^\d{2}$/.test(id) || typeof row.reason !== "string" || !row.reason.trim()) {
      errors.push("excludedChapters entry must have chapter (NN) and reason: " + JSON.stringify(row));
      continue;
    }
    if (presentChapters.has(id)) {
      errors.push("Chapter " + id + " is both present and listed in excludedChapters");
    }
    excludedIds.add(id);
  }

  for (let n = 1; n <= 98; n++) {
    const id = String(n).padStart(2, "0");
    if (!presentChapters.has(id) && !excludedIds.has(id)) {
      errors.push("Chapter " + id + " is neither present nor listed in meta.json excludedChapters");
    }
  }
} catch (err) {
  errors.push("meta.json error: " + err.message);
}

if (errors.length > 0) {
  console.error("\x1b[31mFound " + errors.length + " validation error(s):\x1b[0m");
  for (const err of errors.slice(0, 30)) {
    console.error("  ❌ " + err);
  }
  if (errors.length > 30) {
    console.error("  ... and " + (errors.length - 30) + " more errors.");
  }
  process.exit(1);
}

console.log("\x1b[32m✔ All " + files.length + " chapter files parsed successfully.\x1b[0m");
console.log("\x1b[32m✔ Total HSN codes validated: " + totalEntries.toLocaleString() + "\x1b[0m");
console.log("\x1b[32m✔ Total unique codes: " + allCodes.size.toLocaleString() + " (0 duplicates)\x1b[0m");
console.log("\x1b[32m✔ Codes with historical rate changes: " + multiPeriodCount.toLocaleString() + "\x1b[0m");
console.log("\x1b[32m✔ All rate periods non-overlapping and contiguous.\x1b[0m");
console.log("\x1b[32m✔ Metadata meta.json consistent.\x1b[0m");
'

echo -e "\n${BOLD}[2/3] Running schedule generator and build integrity check...${NC}"
npm run generate:schedule

echo -e "\n${BOLD}[3/3] Running Vitest test suite...${NC}"
npx vitest run

echo -e "\n${BOLD}${GREEN}====================================================${NC}"
echo -e "${BOLD}${GREEN}   ✔ ALL HSN DATASET CHECKS & TESTS PASSED!        ${NC}"
echo -e "${BOLD}${GREEN}====================================================${NC}"
