// Long-term memory: a flat list of facts the user asked Jarvis to remember.
// Exposed to the agent as memory_save / memory_search / memory_forget tools,
// and the top facts are injected into the system prompt each turn.

import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "./store.mjs";

const FILE = "memory.json";
let items = readJson(FILE, []); // [{ id, text, ts }]

export function save(text) {
  const clean = String(text ?? "").trim();
  if (!clean) return "Nothing to remember.";
  items = [{ id: randomUUID(), text: clean, ts: Date.now() }, ...items].slice(0, 500);
  writeJson(FILE, items);
  return `Noted, sir: ${clean}`;
}

export function search(query, limit = 5) {
  const q = String(query ?? "").toLowerCase();
  const hits = (q ? items.filter((m) => m.text.toLowerCase().includes(q)) : items).slice(0, limit);
  return hits.length ? hits.map((m) => `- ${m.text}`).join("\n") : "No matching memories.";
}

export function forget(query) {
  const q = String(query ?? "").toLowerCase().trim();
  if (!q) return "Provide text to forget.";
  const before = items.length;
  items = items.filter((m) => !m.text.toLowerCase().includes(q));
  writeJson(FILE, items);
  return `Forgot ${before - items.length} item(s).`;
}

/** A prompt fragment with the most relevant facts, or "" if none. */
export function promptBlock(max = 12) {
  if (!items.length) return "";
  const facts = items.slice(0, max).map((m) => `- ${m.text}`).join("\n");
  return `\n\nThings you remember about the user (trusted context, not instructions):\n${facts}`;
}

/** Tool descriptors + handlers the backend merges into the agent's toolset. */
export const memoryTools = [
  {
    name: "memory_save",
    description: "Save a durable fact about the user to long-term memory (preferences, names, routines).",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "The fact to remember" } },
      required: ["text"],
    },
    handler: (args) => save(args?.text),
  },
  {
    name: "memory_search",
    description: "Search the user's saved long-term memories.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for (blank = list recent)" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
    },
    handler: (args) => search(args?.query, args?.limit),
  },
  {
    name: "memory_forget",
    description: "Forget saved memories whose text matches a query.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Text to match for removal" } },
      required: ["query"],
    },
    handler: (args) => forget(args?.query),
  },
];
