#!/usr/bin/env node
// Build-time: source HSN/SAC JSON → compact CJS shards
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = process.env.TAX_ENGINE_SCHEDULE_SOURCE ?? path.join(ROOT, 'src/countries/IN/schedules');
const OUT_DIR = process.env.TAX_ENGINE_SCHEDULE_OUT ?? path.join(SOURCE_DIR, 'generated');
const SHARDS_DIR = path.join(OUT_DIR, 'shards');

const TAXABILITIES = new Set([
  'TAXABLE',
  'EXEMPT',
  'NIL_RATED',
  'NON_GST',
  'ZERO_RATED',
]);

/** @typedef {{ ratePercent: number, taxability: string, effectiveFrom: string, effectiveTo: string | null, reverseCharge?: boolean, cessRatePercent?: number }} RatePeriod */
/** @typedef {{ code: string, description?: string, rateHistory: RatePeriod[] }} SourceEntry */

function fail(message) {
  console.error(`[generate-india-schedule] ${message}`);
  process.exit(1);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDescription(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed === '' ? undefined : trimmed;
}

function isIsoDate(value) {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function periodsOverlap(a, b) {
  const aEnd = a.effectiveTo ?? '9999-12-31';
  const bEnd = b.effectiveTo ?? '9999-12-31';
  return a.effectiveFrom <= bEnd && b.effectiveFrom <= aEnd;
}

function assertRateHistoryIntegrity(kind, code, history) {
  if (!Array.isArray(history) || history.length === 0) {
    fail(`${kind} ${code}: rateHistory required`);
  }
  for (const period of history) {
    if (
      typeof period.ratePercent !== 'number' ||
      !Number.isFinite(period.ratePercent) ||
      typeof period.taxability !== 'string' ||
      !TAXABILITIES.has(period.taxability) ||
      typeof period.effectiveFrom !== 'string' ||
      !(period.effectiveTo === null || typeof period.effectiveTo === 'string')
    ) {
      fail(`${kind} ${code}: invalid rateHistory period`);
    }
    if (!isIsoDate(period.effectiveFrom)) {
      fail(`${kind} ${code}: invalid effectiveFrom ${period.effectiveFrom}`);
    }
    if (period.effectiveTo !== null) {
      if (!isIsoDate(period.effectiveTo)) {
        fail(`${kind} ${code}: invalid effectiveTo ${period.effectiveTo}`);
      }
      if (period.effectiveFrom > period.effectiveTo) {
        fail(
          `${kind} ${code}: effectiveFrom ${period.effectiveFrom} > effectiveTo ${period.effectiveTo}`,
        );
      }
    }
    if (
      period.reverseCharge !== undefined &&
      typeof period.reverseCharge !== 'boolean'
    ) {
      fail(`${kind} ${code}: reverseCharge must be boolean when set`);
    }
    if (period.cessRatePercent !== undefined) {
      if (
        typeof period.cessRatePercent !== 'number' ||
        !Number.isFinite(period.cessRatePercent) ||
        period.cessRatePercent < 0
      ) {
        fail(`${kind} ${code}: cessRatePercent must be a non-negative finite number`);
      }
    }
  }
  const sorted = [...history].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0,
  );
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.effectiveFrom === curr.effectiveFrom) {
      fail(`${kind} ${code}: duplicate effectiveFrom ${curr.effectiveFrom}`);
    }
    if (periodsOverlap(prev, curr)) {
      fail(
        `${kind} ${code}: overlapping periods ${prev.effectiveFrom}..${prev.effectiveTo} and ${curr.effectiveFrom}..${curr.effectiveTo}`,
      );
    }
  }
}

// Compact row: [code, description|null, rates[]]
function toCompact(entry, kind) {
  if (!entry || typeof entry.code !== 'string' || !entry.code.trim()) {
    fail(`Invalid ${kind} entry: missing code`);
  }
  const code = entry.code.trim();
  assertRateHistoryIntegrity(kind, code, entry.rateHistory);
  /** @type {unknown[]} */
  const rates = [];
  for (const period of entry.rateHistory) {
    /** @type {(string|number|boolean|null)[]} */
    const row = [
      period.ratePercent,
      period.taxability,
      period.effectiveFrom,
      period.effectiveTo,
    ];
    const hasRcm = period.reverseCharge !== undefined;
    const hasCess = period.cessRatePercent !== undefined;
    if (hasRcm || hasCess) {
      if (period.reverseCharge === true) {
        row.push(true);
      } else if (period.reverseCharge === false) {
        row.push(false);
      } else {
        row.push(null);
      }
      if (hasCess) {
        row.push(period.cessRatePercent);
      }
    }
    rates.push(row);
  }
  const description = normalizeDescription(entry.description);
  return [code, description ?? null, rates];
}

function stableStringify(value) {
  return JSON.stringify(value);
}

function writeShard(shardId, kind, compactRows) {
  const filePath = path.join(SHARDS_DIR, `${shardId}.cjs`);
  const body = `'use strict';\nmodule.exports = ${JSON.stringify({
    id: shardId,
    kind,
    rows: compactRows,
  })};\n`;
  fs.writeFileSync(filePath, body);
}

function main() {
  ensureDir(SHARDS_DIR);

  // Clear previous shards
  for (const name of fs.readdirSync(SHARDS_DIR)) {
    if (name.endsWith('.cjs')) {
      fs.unlinkSync(path.join(SHARDS_DIR, name));
    }
  }

  const metaPath = path.join(SOURCE_DIR, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    fail(`missing ${metaPath}`);
  }
  const sourceMeta = readJson(metaPath);

  /** @type {Map<string, { shardId: string, compact: unknown, source: string }>} */
  const byKey = new Map();
  let sourceRecordCount = 0;
  let duplicateIdentical = 0;

  const hsnDir = path.join(SOURCE_DIR, 'hsn');
  const chapterFiles = fs
    .readdirSync(hsnDir)
    .filter((f) => f.startsWith('ch-') && f.endsWith('.json'))
    .sort();

  /** @type {string[]} */
  const shardIds = [];

  for (const fileName of chapterFiles) {
    const filePath = path.join(hsnDir, fileName);
    const chapter = readJson(filePath);
    if (chapter.kind !== 'HSN' || !Array.isArray(chapter.entries)) {
      fail(`${fileName}: expected HSN chapter with entries[]`);
    }
    const chapterId = String(chapter.chapter).padStart(2, '0');
    const shardId = `hsn-${chapterId}`;
    /** @type {unknown[]} */
    const rows = [];

    for (const entry of chapter.entries) {
      sourceRecordCount += 1;
      const compact = toCompact(entry, 'HSN');
      const code = /** @type {string} */ (compact[0]);
      if (code.slice(0, 2) !== chapterId && code.length >= 2) {
        if (!code.startsWith(chapterId)) {
          fail(
            `${fileName}: HSN ${code} does not belong to chapter ${chapterId}`,
          );
        }
      }
      const key = `HSN:${code}`;
      const existing = byKey.get(key);
      if (existing) {
        if (stableStringify(existing.compact) === stableStringify(compact)) {
          duplicateIdentical += 1;
          continue;
        }
        fail(
          `Conflicting duplicate HSN ${code} in ${existing.source} and ${fileName}`,
        );
      }
      byKey.set(key, { shardId, compact, source: fileName });
      rows.push(compact);
    }

    if (rows.length === 0) {
      fail(`${fileName}: no entries after validation`);
    }
    writeShard(shardId, 'HSN', rows);
    shardIds.push(shardId);
  }

  const sacDir = path.join(SOURCE_DIR, 'sac');
  const headingFiles = fs.existsSync(sacDir)
    ? fs
        .readdirSync(sacDir)
        .filter((f) => f.startsWith('hd-') && f.endsWith('.json'))
        .sort()
    : [];

  /** @type {string[]} */
  const sacHeadings = [];

  for (const fileName of headingFiles) {
    const filePath = path.join(sacDir, fileName);
    const headingFile = readJson(filePath);
    if (headingFile.kind !== 'SAC' || !Array.isArray(headingFile.entries)) {
      fail(`${fileName}: expected SAC heading with entries[]`);
    }
    const headingId = String(headingFile.heading).padStart(4, '0');
    if (!/^\d{4}$/.test(headingId)) {
      fail(`${fileName}: invalid heading ${headingFile.heading}`);
    }
    const shardId = `sac-${headingId}`;
    /** @type {unknown[]} */
    const rows = [];

    for (const entry of headingFile.entries) {
      sourceRecordCount += 1;
      const compact = toCompact(entry, 'SAC');
      const code = /** @type {string} */ (compact[0]);
      if (!code.startsWith(headingId)) {
        fail(`${fileName}: SAC ${code} does not belong to heading ${headingId}`);
      }
      const key = `SAC:${code}`;
      const existing = byKey.get(key);
      if (existing) {
        if (stableStringify(existing.compact) === stableStringify(compact)) {
          duplicateIdentical += 1;
          continue;
        }
        fail(
          `Conflicting duplicate SAC ${code} in ${existing.source} and ${fileName}`,
        );
      }
      byKey.set(key, { shardId, compact, source: fileName });
      rows.push(compact);
    }

    if (rows.length === 0) {
      fail(`${fileName}: no entries after validation`);
    }
    writeShard(shardId, 'SAC', rows);
    shardIds.push(shardId);
    sacHeadings.push(headingId);
  }

  const hsnCount = [...byKey.keys()].filter((k) => k.startsWith('HSN:')).length;
  const sacCount = [...byKey.keys()].filter((k) => k.startsWith('SAC:')).length;
  const generatedRecordCount = byKey.size;

  if (generatedRecordCount + duplicateIdentical !== sourceRecordCount) {
    fail(
      `Integrity mismatch: source=${sourceRecordCount} generated=${generatedRecordCount} identicalDupes=${duplicateIdentical}`,
    );
  }

  if (hsnCount !== sourceMeta.hsnCount) {
    fail(
      `meta.json hsnCount=${sourceMeta.hsnCount} but generated hsn=${hsnCount}`,
    );
  }
  if (sacCount !== sourceMeta.sacCount) {
    fail(
      `meta.json sacCount=${sourceMeta.sacCount} but generated sac=${sacCount}`,
    );
  }

  const generatedAt = new Date().toISOString();
  const integrity = {
    sourceRecordCount,
    generatedRecordCount,
    duplicateIdenticalRemoved: duplicateIdentical,
    hsnCount,
    sacCount,
    shardCount: shardIds.length,
    shardIds,
  };

  const metaTs = `/* Auto-generated by scripts/generate-india-schedule.mjs — do not edit. */
import type { IndiaFullScheduleMeta } from '../schedule-meta.js';

export const INDIA_FULL_SCHEDULE_META = ${JSON.stringify(
    {
      ...sourceMeta,
      generatedAt,
      hsnCount,
      sacCount,
      chapters: chapterFiles.map((f) => f.replace(/^ch-|\.json$/g, '')),
      sacHeadings,
    },
    null,
    2,
  )} as const satisfies IndiaFullScheduleMeta;

export const INDIA_SCHEDULE_INTEGRITY = ${JSON.stringify(integrity, null, 2)} as const;

export const INDIA_SCHEDULE_SHARD_IDS: readonly string[] = INDIA_SCHEDULE_INTEGRITY.shardIds;
`;

  fs.writeFileSync(path.join(OUT_DIR, 'meta.ts'), metaTs);

  console.log(
    `[generate-india-schedule] shards=${shardIds.length} records=${generatedRecordCount} (hsn=${hsnCount}, sac=${sacCount}) identicalDupesRemoved=${duplicateIdentical}`,
  );
}

main();
