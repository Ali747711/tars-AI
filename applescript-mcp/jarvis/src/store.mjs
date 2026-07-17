// Tiny JSON + JSONL persistence under ~/.jarvis. Used for memory, sessions,
// routines, and the activity log. Best-effort: never throws on IO errors.

import { homedir } from "node:os";
import { join } from "node:path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  appendFileSync,
} from "node:fs";

export const JARVIS_DIR = join(homedir(), ".jarvis");
export const LOG_DIR = join(JARVIS_DIR, "log");

try {
  mkdirSync(LOG_DIR, { recursive: true });
} catch {
  /* ignore */
}

export function readJson(file, fallback) {
  const p = join(JARVIS_DIR, file);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  try {
    writeFileSync(join(JARVIS_DIR, file), JSON.stringify(data, null, 2));
  } catch {
    /* ignore */
  }
}

const timers = new Map();
export function writeJsonDebounced(file, data, ms = 500) {
  clearTimeout(timers.get(file));
  timers.set(
    file,
    setTimeout(() => writeJson(file, data), ms),
  );
}

// Local calendar date (YYYY-MM-DD) — not UTC, so "today" matches the user's
// day and the web UI's date picker.
export function localDay(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function today() {
  return localDay();
}

export function appendLog(entry) {
  try {
    appendFileSync(join(LOG_DIR, `activity-${today()}.jsonl`), JSON.stringify(entry) + "\n");
  } catch {
    /* ignore */
  }
}

export function readLog(day, limit = 200) {
  const p = join(LOG_DIR, `activity-${day || today()}.jsonl`);
  if (!existsSync(p)) return [];
  try {
    return readFileSync(p, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
