#!/usr/bin/env node
/**
 * Temporary sync: refresh existing local HSN/SAC schedule records from ClearTax
 * search API (api.clear.in). Not an official CBIC source — verify before production.
 *
 * - Updates description + rateHistory for codes already present locally
 * - Relocates entries when Clear chapter/heading (or HSN↔SAC type) differs
 * - Does not add brand-new codes
 * - Tracks progress in clear-sync-progress.json so runs can resume
 * - Auto-batches: learns how many codes succeed before HTTP 429, then keeps
 *   fetching that many per batch with a gap (default 2s) until Ctrl+C
 * - On 429 / Ctrl+C: flushes schedule + progress (updated / pending counts)
 *
 * Usage:
 *   node scripts/sync-schedule-from-clear.mjs [--dry-run] [--kind HSN|SAC|ALL]
 *     [--limit N] [--codes 0101,998314] [--concurrency 4] [--delay-ms 100]
 *     [--batch-gap-ms 2000] [--resume|--no-resume] [--reset-progress] [--status]
 *
 * After a real write, run: npm run generate:schedule
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR =
  process.env.TAX_ENGINE_SCHEDULE_SOURCE ??
  path.join(ROOT, 'src/countries/IN/schedules');
const HSN_DIR = path.join(SOURCE_DIR, 'hsn');
const SAC_DIR = path.join(SOURCE_DIR, 'sac');
const META_PATH = path.join(SOURCE_DIR, 'meta.json');
const PROGRESS_PATH = path.join(SOURCE_DIR, 'clear-sync-progress.json');
const API_BASE =
  process.env.CLEAR_HSN_API_BASE ??
  'https://api.clear.in/api/ingestion/config/hsn/v2/search';

const DONE_STATUSES = new Set(['updated', 'unchanged', 'missing']);
const TAXABILITIES_ZERO = new Set([
  'NIL_RATED',
  'EXEMPT',
  'NON_GST',
  'ZERO_RATED',
]);

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    kind: 'ALL',
    limit: null,
    codes: null,
    concurrency: 4,
    delayMs: 100,
    batchGapMs: 2000,
    resume: true,
    resetProgress: false,
    statusOnly: false,
    retries: 0,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--kind') opts.kind = String(argv[++i] || 'ALL').toUpperCase();
    else if (arg === '--limit') opts.limit = Number(argv[++i]);
    else if (arg === '--codes') {
      opts.codes = new Set(
        String(argv[++i] || '')
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
      );
    } else if (arg === '--concurrency') opts.concurrency = Number(argv[++i]);
    else if (arg === '--delay-ms') opts.delayMs = Number(argv[++i]);
    else if (arg === '--batch-gap-ms') opts.batchGapMs = Number(argv[++i]);
    else if (arg === '--retries') opts.retries = Number(argv[++i]);
    else if (arg === '--resume') opts.resume = true;
    else if (arg === '--no-resume') opts.resume = false;
    else if (arg === '--reset-progress') opts.resetProgress = true;
    else if (arg === '--status') opts.statusOnly = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`See header comment in ${path.basename(fileURLToPath(import.meta.url))}`);
      process.exit(0);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  if (!['ALL', 'HSN', 'SAC'].includes(opts.kind)) {
    fail(`--kind must be HSN|SAC|ALL, got ${opts.kind}`);
  }
  if (opts.limit != null && (!Number.isFinite(opts.limit) || opts.limit < 1)) {
    fail(`--limit must be a positive number`);
  }
  if (!Number.isFinite(opts.concurrency) || opts.concurrency < 1) {
    fail(`--concurrency must be >= 1`);
  }
  if (!Number.isFinite(opts.retries) || opts.retries < 0) {
    fail(`--retries must be >= 0`);
  }
  if (!Number.isFinite(opts.batchGapMs) || opts.batchGapMs < 0) {
    fail(`--batch-gap-ms must be >= 0`);
  }
  return opts;
}

function fail(message) {
  console.error(`[sync-schedule-from-clear] ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 4)}\n`, 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dayBefore(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function parseClearDate(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const check = new Date(year, month - 1, day);
  if (
    check.getFullYear() !== year ||
    check.getMonth() !== month - 1 ||
    check.getDate() !== day
  ) {
    return null;
  }
  return iso;
}

function padChapter(value) {
  return String(value ?? '').trim().padStart(2, '0');
}

function sacHeadingFromCode(code) {
  return String(code).slice(0, 4);
}

function hsnChapterFromCode(code) {
  return String(code).slice(0, 2).padStart(2, '0');
}

function openPeriod(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  return history.find((p) => p.effectiveTo === null) ?? history[history.length - 1];
}

function inferTaxability(ratePercent, previousTaxability) {
  if (ratePercent === 0) {
    if (previousTaxability && TAXABILITIES_ZERO.has(previousTaxability)) {
      return previousTaxability;
    }
    return 'NIL_RATED';
  }
  return 'TAXABLE';
}

/**
 * When Clear returns multiple rates for the same effective date (common on SAC),
 * prefer the local open rate if present, else the highest rate.
 */
function pickRateForDate(rates, preferredRate) {
  const unique = [...new Set(rates)].sort((a, b) => a - b);
  if (unique.length === 1) return { rate: unique[0], ambiguous: false };
  if (preferredRate != null && unique.includes(preferredRate)) {
    return { rate: preferredRate, ambiguous: true };
  }
  return { rate: unique[unique.length - 1], ambiguous: true };
}

function buildRateHistoryFromClear(taxDetails, previousHistory) {
  const preferred = openPeriod(previousHistory)?.ratePercent ?? null;
  const previousTaxability = openPeriod(previousHistory)?.taxability ?? null;
  /** @type {Map<string, number[]>} */
  const byDate = new Map();
  /** @type {Map<string, Map<number, string>>} */
  const descByDateRate = new Map();

  for (const detail of taxDetails ?? []) {
    const iso = parseClearDate(detail.effectiveDate);
    const rate = Number(detail.rateOfTax);
    if (!iso || !Number.isFinite(rate) || rate < 0) continue;
    if (!byDate.has(iso)) byDate.set(iso, []);
    byDate.get(iso).push(rate);
    const desc = String(detail.description ?? '').trim();
    if (desc) {
      if (!descByDateRate.has(iso)) descByDateRate.set(iso, new Map());
      const byRate = descByDateRate.get(iso);
      if (!byRate.has(rate)) byRate.set(rate, desc);
    }
  }

  if (byDate.size === 0) {
    return { history: null, description: null, warnings: ['no_usable_tax_details'] };
  }

  const dates = [...byDate.keys()].sort();
  const warnings = [];
  /** @type {{ ratePercent: number, taxability: string, effectiveFrom: string, effectiveTo: string | null }[]} */
  const history = [];
  /** @type {string | null} */
  let description = null;

  for (let i = 0; i < dates.length; i += 1) {
    const from = dates[i];
    const { rate, ambiguous } = pickRateForDate(byDate.get(from), preferred);
    if (ambiguous) {
      warnings.push(`ambiguous_rates_on_${from}_picked_${rate}`);
    }
    const next = dates[i + 1];
    history.push({
      ratePercent: rate,
      taxability: inferTaxability(rate, previousTaxability),
      effectiveFrom: from,
      effectiveTo: next ? dayBefore(next) : null,
    });
    const byRate = descByDateRate.get(from);
    if (byRate?.has(rate)) description = byRate.get(rate);
    else if (byRate && byRate.size > 0) description = [...byRate.values()][0];
  }

  return { history, description, warnings };
}

function historiesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function loadScheduleIndex() {
  /** @type {Map<string, { kind: 'HSN'|'SAC', code: string, bucket: string, filePath: string, entry: object, index: number }>} */
  const byKey = new Map();
  /** @type {Map<string, { kind: 'HSN'|'SAC', bucket: string, filePath: string, doc: object }>} */
  const files = new Map();

  for (const fileName of fs.readdirSync(HSN_DIR).filter((f) => f.startsWith('ch-') && f.endsWith('.json'))) {
    const filePath = path.join(HSN_DIR, fileName);
    const doc = readJson(filePath);
    const bucket = padChapter(doc.chapter);
    const fileKey = `HSN:${bucket}`;
    files.set(fileKey, { kind: 'HSN', bucket, filePath, doc });
    for (let i = 0; i < doc.entries.length; i += 1) {
      const entry = doc.entries[i];
      const key = `HSN:${entry.code}`;
      if (byKey.has(key)) fail(`Duplicate local HSN ${entry.code}`);
      byKey.set(key, {
        kind: 'HSN',
        code: entry.code,
        bucket,
        filePath,
        entry,
        index: i,
      });
    }
  }

  for (const fileName of fs.readdirSync(SAC_DIR).filter((f) => f.startsWith('hd-') && f.endsWith('.json'))) {
    const filePath = path.join(SAC_DIR, fileName);
    const doc = readJson(filePath);
    const bucket = String(doc.heading);
    const fileKey = `SAC:${bucket}`;
    files.set(fileKey, { kind: 'SAC', bucket, filePath, doc });
    for (let i = 0; i < doc.entries.length; i += 1) {
      const entry = doc.entries[i];
      const key = `SAC:${entry.code}`;
      if (byKey.has(key)) fail(`Duplicate local SAC ${entry.code}`);
      byKey.set(key, {
        kind: 'SAC',
        code: entry.code,
        bucket,
        filePath,
        entry,
        index: i,
      });
    }
  }

  return { byKey, files };
}

function targetPlacement(clearResult, code) {
  const clearType = String(clearResult.type || '').toUpperCase() === 'SAC' ? 'SAC' : 'HSN';
  if (clearType === 'SAC') {
    return {
      kind: 'SAC',
      bucket: sacHeadingFromCode(code),
      warnings:
        padChapter(clearResult.chapterNumber) !== '99'
          ? [`clear_sac_chapter_${clearResult.chapterNumber}`]
          : [],
    };
  }

  const clearChapter = padChapter(clearResult.chapterNumber);
  const codeChapter = hsnChapterFromCode(code);
  const warnings = [];
  // File by Clear chapter when it matches the HS prefix; otherwise keep code prefix
  // so generate/recheck stay valid, but still relocate out of a wrong local file.
  let bucket = codeChapter;
  if (/^\d{2}$/.test(clearChapter) && clearChapter === codeChapter) {
    bucket = clearChapter;
  } else if (/^\d{2}$/.test(clearChapter) && clearChapter !== codeChapter) {
    warnings.push(
      `clear_chapter_${clearChapter}_differs_from_code_prefix_${codeChapter}_using_code_prefix`,
    );
  } else if (!/^\d{2}$/.test(clearChapter)) {
    warnings.push('clear_chapter_invalid_using_code_prefix');
  }
  return { kind: 'HSN', bucket, warnings };
}

function codeKey(kind, code) {
  return `${kind}:${code}`;
}

function emptyProgressSummary() {
  return {
    total: 0,
    done: 0,
    pending: 0,
    updated: 0,
    unchanged: 0,
    missing: 0,
    error: 0,
    rateLimited: 0,
  };
}

function recomputeProgressSummary(progress) {
  const summary = emptyProgressSummary();
  const codes = progress.codes ?? {};
  for (const entry of Object.values(codes)) {
    summary.total += 1;
    if (DONE_STATUSES.has(entry.status)) {
      summary.done += 1;
      if (entry.status === 'updated') summary.updated += 1;
      if (entry.status === 'unchanged') summary.unchanged += 1;
      if (entry.status === 'missing') summary.missing += 1;
    } else {
      summary.pending += 1;
      if (entry.status === 'error' || entry.status === 'pending') summary.error += 1;
      if (entry.rateLimited) summary.rateLimited += 1;
    }
  }
  progress.summary = summary;
  return summary;
}

function loadProgress() {
  if (!fs.existsSync(PROGRESS_PATH)) {
    return {
      startedAt: null,
      updatedAt: null,
      source: 'clear.in',
      learnedBatchSize: null,
      summary: emptyProgressSummary(),
      codes: {},
    };
  }
  const progress = readJson(PROGRESS_PATH);
  if (!progress.codes || typeof progress.codes !== 'object') progress.codes = {};
  if (
    progress.learnedBatchSize != null &&
    (!Number.isFinite(progress.learnedBatchSize) || progress.learnedBatchSize < 1)
  ) {
    progress.learnedBatchSize = null;
  }
  recomputeProgressSummary(progress);
  return progress;
}

function saveProgress(progress) {
  progress.updatedAt = new Date().toISOString();
  recomputeProgressSummary(progress);
  writeJson(PROGRESS_PATH, progress);
}

function ensureProgressCodes(progress, workItems) {
  if (!progress.startedAt) progress.startedAt = new Date().toISOString();
  for (const item of workItems) {
    const key = codeKey(item.kind, item.code);
    if (!progress.codes[key]) {
      progress.codes[key] = {
        status: 'pending',
        kind: item.kind,
        code: item.code,
        attempts: 0,
        lastError: null,
        rateLimited: false,
        syncedAt: null,
      };
    }
  }
  recomputeProgressSummary(progress);
}

function printProgressStatus(progress, { listPending = false, pendingLimit = 40 } = {}) {
  const s = progress.summary ?? emptyProgressSummary();
  console.log('[sync-schedule-from-clear] progress status');
  console.log(`  file: ${PROGRESS_PATH}`);
  console.log(`  startedAt: ${progress.startedAt ?? '—'}`);
  console.log(`  updatedAt: ${progress.updatedAt ?? '—'}`);
  console.log(`  learnedBatchSize: ${progress.learnedBatchSize ?? '—'}`);
  console.log(
    `  total=${s.total} done=${s.done} pending=${s.pending} updated=${s.updated} unchanged=${s.unchanged} missing=${s.missing} rateLimited=${s.rateLimited}`,
  );
  if (!listPending) return;
  const pendingKeys = Object.entries(progress.codes ?? {})
    .filter(([, v]) => !DONE_STATUSES.has(v.status))
    .map(([k]) => k)
    .sort();
  if (pendingKeys.length) {
    const preview = pendingKeys.slice(0, pendingLimit);
    console.log(`  pending codes (${pendingKeys.length}):`);
    for (const key of preview) {
      const row = progress.codes[key];
      console.log(
        `    - ${key} status=${row.status}${row.lastError ? ` error=${row.lastError}` : ''}`,
      );
    }
    if (pendingKeys.length > preview.length) {
      console.log(`    … ${pendingKeys.length - preview.length} more`);
    }
  }
}

async function fetchClear(code, { retries = 3 } = {}) {
  const url = new URL(API_BASE);
  url.searchParams.set('hsnSearchKey', code);
  url.searchParams.set('page', '0');
  url.searchParams.set('size', '20');

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json, text/plain, */*',
        origin: 'https://cleartax.in',
        referer: 'https://cleartax.in/',
        'user-agent':
          'Mozilla/5.0 (compatible; tax-engine-schedule-sync/1.0; +local-dev)',
      },
    });
    if (response.ok) {
      const body = await response.json();
      const results = Array.isArray(body.results) ? body.results : [];
      return results.find((r) => String(r.hsnCode) === code && r.active !== false) ?? null;
    }

    const retryAfterRaw = response.headers.get('retry-after');
    const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : NaN;
    const isRateLimited = response.status === 429 || response.status === 503;
    lastError = new Error(`HTTP ${response.status}`);
    lastError.rateLimited = isRateLimited;
    lastError.status = response.status;

    // Caller pauses and retries 429 later. Do not spin inside this request.
    if (isRateLimited || attempt === retries) {
      throw lastError;
    }

    const backoffMs = Number.isFinite(retryAfterSec)
      ? Math.max(1000, retryAfterSec * 1000)
      : 1000 * 2 ** attempt;
    await sleep(backoffMs);
  }
  throw lastError ?? new Error('fetch failed');
}

async function mapPool(items, concurrency, fn, onItem, shouldStop) {
  let next = 0;
  async function worker() {
    while (true) {
      if (shouldStop?.()) return;
      const i = next;
      next += 1;
      if (i >= items.length) return;
      if (shouldStop?.()) return;
      const result = await fn(items[i], i);
      if (onItem) await onItem(result, i);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 0)) },
    () => worker(),
  );
  await Promise.all(workers);
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

function ensureFile(files, kind, bucket) {
  const fileKey = `${kind}:${bucket}`;
  const existing = files.get(fileKey);
  if (existing) return existing;

  const filePath =
    kind === 'HSN'
      ? path.join(HSN_DIR, `ch-${bucket}.json`)
      : path.join(SAC_DIR, `hd-${bucket}.json`);
  const doc =
    kind === 'HSN'
      ? { chapter: bucket, kind: 'HSN', count: 0, entries: [] }
      : { heading: bucket, kind: 'SAC', count: 0, entries: [] };
  const created = { kind, bucket, filePath, doc, dirty: true };
  files.set(fileKey, created);
  return created;
}

function removeEntryFromFile(files, local) {
  const fileKey = `${local.kind}:${local.bucket}`;
  const file = files.get(fileKey);
  if (!file) return;
  const before = file.doc.entries.length;
  file.doc.entries = file.doc.entries.filter((e) => e.code !== local.code);
  if (file.doc.entries.length !== before) {
    file.doc.count = file.doc.entries.length;
    file.dirty = true;
  }
}

function upsertEntry(files, kind, bucket, entry) {
  const file = ensureFile(files, kind, bucket);
  const idx = file.doc.entries.findIndex((e) => e.code === entry.code);
  if (idx >= 0) file.doc.entries[idx] = entry;
  else file.doc.entries.push(entry);
  file.doc.entries.sort((a, b) => String(a.code).localeCompare(String(b.code), 'en'));
  file.doc.count = file.doc.entries.length;
  file.dirty = true;
}

function refreshMeta(files) {
  const meta = readJson(META_PATH);
  const chapters = [];
  const sacHeadings = [];
  let hsnCount = 0;
  let sacCount = 0;
  for (const file of files.values()) {
    if (file.doc.entries.length === 0) continue;
    if (file.kind === 'HSN') {
      chapters.push(file.bucket);
      hsnCount += file.doc.entries.length;
    } else {
      sacHeadings.push(file.bucket);
      sacCount += file.doc.entries.length;
    }
  }
  chapters.sort();
  sacHeadings.sort();
  meta.hsnCount = hsnCount;
  meta.sacCount = sacCount;
  meta.chapters = chapters;
  meta.sacHeadings = sacHeadings;
  meta.generatedAt = new Date().toISOString();
  // Keep schedule meta generate-compatible; sync progress lives in clear-sync-progress.json
  delete meta.lastClearSyncAt;
  delete meta.clearSync;
  return meta;
}

function markProgress(progress, key, patch) {
  const prev = progress.codes[key] ?? {
    status: 'pending',
    kind: key.split(':')[0],
    code: key.slice(key.indexOf(':') + 1),
    attempts: 0,
    lastError: null,
    rateLimited: false,
    syncedAt: null,
  };
  progress.codes[key] = {
    ...prev,
    ...patch,
    attempts: (prev.attempts ?? 0) + (patch.bumpAttempt ? 1 : 0),
  };
  delete progress.codes[key].bumpAttempt;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { byKey, files } = loadScheduleIndex();

  if (opts.resetProgress && fs.existsSync(PROGRESS_PATH)) {
    fs.unlinkSync(PROGRESS_PATH);
    console.log(`[sync-schedule-from-clear] reset progress file: ${PROGRESS_PATH}`);
  }

  let progress = loadProgress();

  if (opts.statusOnly) {
    if (!Object.keys(progress.codes).length) {
      ensureProgressCodes(progress, [...byKey.values()]);
      console.log('[sync-schedule-from-clear] no prior run — all local codes are pending');
    }
    printProgressStatus(progress, { listPending: true });
    return;
  }

  let work = [...byKey.values()];
  if (opts.kind !== 'ALL') {
    work = work.filter((item) => item.kind === opts.kind);
  }
  if (opts.codes) {
    work = work.filter(
      (item) => opts.codes.has(item.code) || opts.codes.has(codeKey(item.kind, item.code)),
    );
  }
  work.sort((a, b) => a.code.localeCompare(b.code, 'en') || a.kind.localeCompare(b.kind));

  ensureProgressCodes(progress, work);

  if (opts.resume) {
    const before = work.length;
    work = work.filter((item) => {
      const row = progress.codes[codeKey(item.kind, item.code)];
      return !row || !DONE_STATUSES.has(row.status);
    });
    console.log(
      `[sync-schedule-from-clear] resume=true skippedDone=${before - work.length} remaining=${work.length}`,
    );
  } else {
    for (const item of work) {
      const key = codeKey(item.kind, item.code);
      markProgress(progress, key, {
        status: 'pending',
        lastError: null,
        rateLimited: false,
        syncedAt: null,
        bumpAttempt: false,
      });
      progress.codes[key].attempts = 0;
    }
  }

  if (opts.limit != null) work = work.slice(0, opts.limit);

  console.log(
    `[sync-schedule-from-clear] codes=${work.length} dryRun=${opts.dryRun} concurrency=${opts.concurrency} delayMs=${opts.delayMs} batchGapMs=${opts.batchGapMs}`,
  );

  if (!opts.dryRun) saveProgress(progress);
  printProgressStatus(progress, { listPending: false });

  const summary = {
    updated: 0,
    unchanged: 0,
    moved: 0,
    missing: 0,
    errors: 0,
    rateLimited: 0,
    ambiguous: 0,
    warnings: [],
  };

  const runTotal = work.length;
  let completed = 0;
  let sinceFlush = 0;
  let sinceLog = 0;
  let lastLogAt = Date.now();
  const startedAtMs = Date.now();
  let scheduleDirty = false;
  let stopWave = false;
  let waveRateLimited = false;
  let rateLimitKey = null;
  let batchSize =
    Number.isFinite(progress.learnedBatchSize) && progress.learnedBatchSize >= 1
      ? Math.floor(progress.learnedBatchSize)
      : null;
  let manualStop = false;
  const retryNextRun = new Set();
  const wave = { ok: 0 };
  let detailLogsLeft = { updated: 20, missing: 10, error: 10, rateLimited: 5 };

  const rememberBatchSize = (nextSize) => {
    if (!Number.isFinite(nextSize) || nextSize < 1) return;
    batchSize = Math.floor(nextSize);
    progress.learnedBatchSize = batchSize;
  };

  const flushDisk = () => {
    if (opts.dryRun) {
      recomputeProgressSummary(progress);
      sinceFlush = 0;
      return;
    }
    if (scheduleDirty) {
      let wroteSchedule = false;
      for (const file of files.values()) {
        if (!file.dirty) continue;
        wroteSchedule = true;
        if (file.doc.entries.length === 0) {
          if (fs.existsSync(file.filePath)) fs.unlinkSync(file.filePath);
        } else {
          file.doc.count = file.doc.entries.length;
          writeJson(file.filePath, file.doc);
        }
        file.dirty = false;
      }
      if (wroteSchedule) writeJson(META_PATH, refreshMeta(files));
      scheduleDirty = false;
    }
    saveProgress(progress);
    sinceFlush = 0;
  };

  const logCheckpoint = (reason) => {
    const ps = recomputeProgressSummary(progress);
    console.log(
      `[sync-schedule-from-clear] ${reason} | updated=${ps.updated} unchanged=${ps.unchanged} done=${ps.done}/${ps.total} pending=${ps.pending}`,
    );
  };

  const onSigint = () => {
    if (manualStop) {
      flushDisk();
      logCheckpoint('forced stop — progress saved');
      process.exit(130);
    }
    manualStop = true;
    stopWave = true;
    console.log(
      '[sync-schedule-from-clear] stop requested — finishing in-flight calls, then saving. Ctrl+C again to exit now.',
    );
  };
  process.on('SIGINT', onSigint);

  const pauseGap = async () => {
    let left = opts.batchGapMs;
    while (left > 0) {
      if (manualStop) return;
      const step = Math.min(200, left);
      await sleep(step);
      left -= step;
    }
  };

  const pendingItems = () =>
    work.filter((item) => {
      const key = codeKey(item.kind, item.code);
      if (retryNextRun.has(key)) return false;
      const row = progress.codes[key];
      return !row || !DONE_STATUSES.has(row.status);
    });

  const logLive = (force = false) => {
    const now = Date.now();
    if (!force && sinceLog < 10 && now - lastLogAt < 2000) return;
    const elapsedSec = (now - startedAtMs) / 1000;
    const rate = completed > 0 ? completed / Math.max(elapsedSec, 0.001) : 0;
    const remaining = runTotal - completed;
    const eta = rate > 0 ? remaining / rate : NaN;
    const pct = runTotal ? ((completed / runTotal) * 100).toFixed(1) : '0.0';
    const ps = recomputeProgressSummary(progress);
    console.log(
      `[sync-schedule-from-clear] ${completed}/${runTotal} (${pct}%) ` +
        `ok=${summary.updated + summary.unchanged + summary.missing} ` +
        `updated=${summary.updated} unchanged=${summary.unchanged} ` +
        `missing=${summary.missing} err=${summary.errors} 429=${summary.rateLimited} ` +
        `rate=${rate.toFixed(1)}/s eta=${formatEta(eta)} | ` +
        `overall done=${ps.done}/${ps.total} pending=${ps.pending}`,
    );
    sinceLog = 0;
    lastLogAt = now;
  };

  const handleOutcome = (outcome) => {
    completed += 1;
    sinceFlush += 1;
    sinceLog += 1;

    if (outcome.status === 'missing') {
      summary.missing += 1;
      markProgress(progress, outcome.key, {
        status: 'missing',
        lastError: null,
        rateLimited: false,
        syncedAt: new Date().toISOString(),
        bumpAttempt: true,
      });
      if (detailLogsLeft.missing > 0) {
        detailLogsLeft.missing -= 1;
        console.log(`[sync-schedule-from-clear] missing ${outcome.key}`);
      }
      wave.ok += 1;
      if (sinceFlush >= 25) flushDisk();
      logLive();
      return;
    }

    if (outcome.status === 'error') {
      summary.errors += 1;
      if (outcome.rateLimited) summary.rateLimited += 1;
      summary.warnings.push(`${outcome.key} ${outcome.error}`);
      markProgress(progress, outcome.key, {
        status: 'pending',
        lastError: outcome.error,
        rateLimited: Boolean(outcome.rateLimited),
        syncedAt: null,
        bumpAttempt: true,
      });
      const detailKey = outcome.rateLimited ? 'rateLimited' : 'error';
      if (detailLogsLeft[detailKey] > 0) {
        detailLogsLeft[detailKey] -= 1;
        console.log(
          `[sync-schedule-from-clear] ${outcome.rateLimited ? 'rate-limit' : 'error'} ${outcome.key} ${outcome.error}`,
        );
      }
      if (outcome.rateLimited) {
        waveRateLimited = true;
        if (!stopWave) {
          stopWave = true;
          rateLimitKey = outcome.key;
          if (wave.ok > 0) rememberBatchSize(wave.ok);
          flushDisk();
          logCheckpoint(`HTTP 429 on ${outcome.key} — progress saved`);
        }
      } else {
        retryNextRun.add(outcome.key);
      }
      if (sinceFlush >= 25) flushDisk();
      logLive();
      return;
    }

    const { local, placement, history, description, warnings, key } = outcome;
    if (warnings.some((w) => w.startsWith('ambiguous_rates_'))) summary.ambiguous += 1;
    for (const w of warnings) summary.warnings.push(`${key} ${w}`);

    const nextEntry = {
      code: local.code,
      description:
        description ??
        (typeof local.entry.description === 'string' ? local.entry.description : ''),
      rateHistory: history,
    };

    const kindChanged = placement.kind !== local.kind;
    const bucketChanged = placement.bucket !== local.bucket || kindChanged;
    const contentChanged =
      !historiesEqual(local.entry.rateHistory, nextEntry.rateHistory) ||
      String(local.entry.description ?? '') !== String(nextEntry.description ?? '');

    if (!bucketChanged && !contentChanged) {
      summary.unchanged += 1;
      markProgress(progress, key, {
        status: 'unchanged',
        lastError: null,
        rateLimited: false,
        syncedAt: new Date().toISOString(),
        bumpAttempt: true,
      });
      wave.ok += 1;
      if (sinceFlush >= 25) flushDisk();
      logLive();
      return;
    }

    if (!opts.dryRun) {
      if (bucketChanged) {
        removeEntryFromFile(files, local);
        summary.moved += 1;
      }
      upsertEntry(files, placement.kind, placement.bucket, nextEntry);
      scheduleDirty = true;
    } else if (bucketChanged) {
      summary.moved += 1;
    }

    summary.updated += 1;
    markProgress(progress, key, {
      status: 'updated',
      lastError: null,
      rateLimited: false,
      syncedAt: new Date().toISOString(),
      moved: Boolean(bucketChanged),
      bumpAttempt: true,
    });
    if (detailLogsLeft.updated > 0) {
      detailLogsLeft.updated -= 1;
      console.log(
        `[sync-schedule-from-clear] updated ${key}${bucketChanged ? ` → ${placement.kind}:${placement.bucket}` : ''}`,
      );
    }
    wave.ok += 1;
    if (sinceFlush >= 25) flushDisk();
    logLive();
  };

  if (batchSize != null) {
    console.log(
      `[sync-schedule-from-clear] using learned batchSize=${batchSize} from progress file`,
    );
  }
  console.log(
    `[sync-schedule-from-clear] fetching… gap=${opts.batchGapMs}ms between batches (Ctrl+C saves progress and stops)`,
  );

  let batchNumber = 0;
  while (!manualStop) {
    const pending = pendingItems();
    if (!pending.length) break;

    batchNumber += 1;
    stopWave = false;
    waveRateLimited = false;
    rateLimitKey = null;
    wave.ok = 0;
    const size = batchSize == null ? pending.length : Math.min(batchSize, pending.length);
    const slice = pending.slice(0, size);
    console.log(
      `[sync-schedule-from-clear] batch ${batchNumber} size=${slice.length}` +
        `${batchSize == null ? ' (learning until HTTP 429)' : ` batchSize=${batchSize}`} pending=${pending.length}`,
    );

    await mapPool(
      slice,
      opts.concurrency,
      async (local) => {
        if (stopWave) {
          return {
            status: 'skipped',
            local,
            key: codeKey(local.kind, local.code),
          };
        }
        if (opts.delayMs > 0) await sleep(opts.delayMs);
        if (stopWave) {
          return {
            status: 'skipped',
            local,
            key: codeKey(local.kind, local.code),
          };
        }
        const key = codeKey(local.kind, local.code);
        try {
          const clear = await fetchClear(local.code, { retries: opts.retries });
          if (!clear) return { status: 'missing', local, key };
          const placement = targetPlacement(clear, local.code);
          const built = buildRateHistoryFromClear(clear.taxDetails, local.entry.rateHistory);
          if (!built.history) {
            return {
              status: 'error',
              local,
              key,
              error: built.warnings.join(',') || 'no_history',
              rateLimited: false,
            };
          }
          return {
            status: 'ok',
            local,
            key,
            clear,
            placement,
            history: built.history,
            description: built.description,
            warnings: [...placement.warnings, ...built.warnings],
          };
        } catch (err) {
          return {
            status: 'error',
            local,
            key,
            error: err instanceof Error ? err.message : String(err),
            rateLimited: Boolean(err && err.rateLimited),
          };
        }
      },
      async (outcome) => {
        if (outcome.status === 'skipped') return;
        handleOutcome(outcome);
      },
      () => stopWave,
    );

    flushDisk();
    logLive(true);
    if (waveRateLimited && wave.ok > 0 && (batchSize == null || wave.ok < batchSize)) {
      rememberBatchSize(wave.ok);
      flushDisk();
      console.log(
        `[sync-schedule-from-clear] batch size=${batchSize} (successful calls before HTTP 429)`,
      );
    }
    logCheckpoint(
      waveRateLimited
        ? `batch ${batchNumber} paused on HTTP 429 (${rateLimitKey}) ok=${wave.ok}`
        : `batch ${batchNumber} done ok=${wave.ok}`,
    );

    if (!pendingItems().length || manualStop) break;
    if (waveRateLimited || batchSize != null) {
      console.log(`[sync-schedule-from-clear] waiting ${opts.batchGapMs}ms`);
      await pauseGap();
    }
  }

  process.off('SIGINT', onSigint);
  flushDisk();

  const ps = progress.summary;
  console.log(
    `[sync-schedule-from-clear] done run updated=${summary.updated} moved=${summary.moved} unchanged=${summary.unchanged} missing=${summary.missing} errors=${summary.errors} rateLimited=${summary.rateLimited} ambiguous=${summary.ambiguous}`,
  );
  console.log(
    `[sync-schedule-from-clear] progress total=${ps.total} done=${ps.done} pending=${ps.pending} (updated=${ps.updated} unchanged=${ps.unchanged} missing=${ps.missing} rateLimited=${ps.rateLimited})`,
  );
  console.log(`[sync-schedule-from-clear] progress file: ${PROGRESS_PATH}`);
  if (summary.warnings.length) {
    const preview = summary.warnings.slice(0, 20);
    console.log(`[sync-schedule-from-clear] warnings (${summary.warnings.length}):`);
    for (const line of preview) console.log(`  - ${line}`);
    if (summary.warnings.length > preview.length) {
      console.log(`  … ${summary.warnings.length - preview.length} more`);
    }
  }
  if (manualStop) {
    console.log(
      '[sync-schedule-from-clear] stopped manually. Progress saved. Re-run the same command to resume.',
    );
    process.exitCode = 130;
    return;
  }
  if (ps.pending > 0) {
    console.log(
      '[sync-schedule-from-clear] pending remain — re-run same command later (resume is on by default)',
    );
  }
  if (!opts.dryRun && summary.updated > 0) {
    console.log('[sync-schedule-from-clear] Next: npm run generate:schedule');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
