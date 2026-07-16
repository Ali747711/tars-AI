// Jarvis's diary: turns the activity log (~/.jarvis/log/activity-*.jsonl,
// written by the backend on every turn) into context the model can use —
// an ambient "recent activity" prompt block, and an activity_recall tool for
// questions like "what did we do yesterday?".

import { readLog } from "./store.mjs";

const MAX_DAYS_BACK = 14;

function dayString(daysAgo = 0) {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function clip(text, max = 120) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** One log entry → a compact single line the model can scan cheaply. */
function formatEntry(entry, withDay = false) {
  const t = new Date(entry.ts);
  const hhmm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  const when = withDay ? `${new Date(entry.ts).toISOString().slice(0, 10)} ${hhmm}` : hhmm;
  const tools = entry.steps?.length ? ` [tools: ${entry.steps.map((s) => s.tool).join(", ")}]` : "";
  const who = entry.kind === "routine" ? "routine" : "user";
  return `- ${when} ${who}: ${clip(entry.user)} → ${clip(entry.reply)}${tools}`;
}

/**
 * A prompt fragment with the last few interactions (today + yesterday), so
 * "that thing we just did" works across restarts without any tool call.
 */
export function recentActivityBlock(limit = 8) {
  const entries = [...readLog(dayString(1)), ...readLog(dayString(0))].slice(-limit);
  if (!entries.length) return "";
  const lines = entries.map((e) => formatEntry(e, true)).join("\n");
  return `\n\nRecent activity from your log (for continuity; older history is available via activity_recall):\n${lines}`;
}

/** Search the last `days` days of the activity log, optionally filtered. */
export function recall({ days = 2, query = "", limit = 15 } = {}) {
  const n = Math.min(Math.max(Number(days) || 2, 1), MAX_DAYS_BACK);
  const q = String(query ?? "").toLowerCase().trim();
  const entries = [];
  for (let ago = n - 1; ago >= 0; ago--) entries.push(...readLog(dayString(ago), 500));
  const hits = q
    ? entries.filter((e) => `${e.user} ${e.reply}`.toLowerCase().includes(q))
    : entries;
  const shown = hits.slice(-Math.min(Math.max(Number(limit) || 15, 1), 50));
  if (!shown.length) return q ? `No activity matching "${query}" in the last ${n} day(s).` : "No logged activity in that period.";
  return shown.map((e) => formatEntry(e, true)).join("\n");
}

/** Tool descriptors + handlers the backend merges into the agent's toolset. */
export const activityTools = [
  {
    name: "activity_recall",
    description:
      "Look up past interactions with the user from the activity log (what was asked, what tools ran, what was answered). Use for questions like 'what did we do yesterday?' or 'what was that link you found me last week?'.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: `How many days back to search, including today (default 2, max ${MAX_DAYS_BACK})` },
        query: { type: "string", description: "Case-insensitive text filter (blank = everything)" },
        limit: { type: "number", description: "Max entries to return, most recent last (default 15)" },
      },
    },
    handler: (args) => recall(args ?? {}),
  },
];
