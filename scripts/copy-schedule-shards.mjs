#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src/countries/IN/schedules/generated/shards');
const DEST = path.join(ROOT, 'dist/countries/IN/schedules/generated/shards');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

if (!fs.existsSync(SRC)) {
  console.error(`[copy-schedule-shards] missing ${SRC}; run generate:schedule first`);
  process.exit(1);
}

fs.rmSync(DEST, { recursive: true, force: true });
copyDir(SRC, DEST);
const count = fs.readdirSync(DEST).filter((f) => f.endsWith('.cjs')).length;
console.log(`[copy-schedule-shards] copied ${count} shard files to dist`);
