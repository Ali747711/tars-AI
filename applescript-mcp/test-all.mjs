// End-to-end tool tester for applescript-mcp.
// Boots the server once and calls each tool over the real MCP protocol,
// then prints a PASS/FAIL table.
//
// Usage:
//   node test-all.mjs           # safe (read-only) + reversible/mild tools
//   node test-all.mjs --writes  # also run mild write tools (notes/notification/launch)
//   node test-all.mjs --danger  # also run destructive tools (quit app, iterm shell, send msg)
//
// Destructive tools are NEVER run unless --danger is passed. Even then,
// messaging uses auto:false (opens the app, does not send).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const flags = new Set(process.argv.slice(2));
const runWrites = flags.has("--writes") || flags.has("--danger");
const runDanger = flags.has("--danger");

const here = dirname(fileURLToPath(import.meta.url));
const child = spawn("node", [join(here, "dist/index.js")], {
  stdio: ["pipe", "pipe", "ignore"],
});

let buf = "";
let nextId = 1;
const pending = new Map();
child.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const l = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!l) continue;
    let m;
    try { m = JSON.parse(l); } catch { continue; }
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
const rpc = (method, params) =>
  new Promise((r) => {
    const id = nextId++;
    pending.set(id, r);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });

async function callTool(name, args = {}) {
  const res = await rpc("tools/call", { name, arguments: args });
  if (res.error) return { ok: false, text: JSON.stringify(res.error) };
  const text = (res.result?.content ?? []).map((c) => c.text ?? "").join("\n").trim();
  // The server returns tool-level failures as isError with an "Error:"/"Failed" body.
  const failed = res.result?.isError || /^Error:|execution error|Failed to /i.test(text);
  return { ok: !failed, text };
}

const short = (t, n = 80) => {
  const s = (t || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s || "(empty)";
};

// --- test plan -------------------------------------------------------------
// tier: "read" (safe), "write" (mild, reversible-ish), "danger" (destructive)
const TESTS = [
  // system
  { name: "system_get_frontmost_app", args: {}, tier: "read" },
  { name: "system_get_battery_status", args: {}, tier: "read" },
  { name: "system_toggle_dark_mode", args: {}, tier: "write", restore: { name: "system_toggle_dark_mode", args: {} } },
  { name: "system_launch_app", args: { name: "Calculator" }, tier: "write" },
  { name: "system_volume", args: { level: 40 }, tier: "danger", note: "changes volume" },
  { name: "system_quit_app", args: { name: "Calculator" }, tier: "danger", note: "quits Calculator" },
  // calendar
  { name: "calendar_list", args: { daysAhead: 7 }, tier: "read" },
  { name: "calendar_add", args: { title: "Jarvis self-test", startDate: dt(2), endDate: dt(2, 1) }, tier: "write" },
  // finder
  { name: "finder_get_selected_files", args: {}, tier: "read" },
  { name: "finder_search_files", args: { query: "test" }, tier: "read" },
  { name: "finder_quick_look_file", args: { path: home("Desktop") }, tier: "write", note: "opens a preview window" },
  // clipboard (save + restore around the write)
  { name: "clipboard_get_clipboard", args: {}, tier: "read" },
  { name: "clipboard_set_clipboard", args: { content: "jarvis-test-clip" }, tier: "write", clipboardRestore: true },
  { name: "clipboard_clear_clipboard", args: {}, tier: "write", clipboardRestore: true },
  // notifications
  { name: "notifications_send_notification", args: { title: "Jarvis", message: "Self-test notification" }, tier: "write" },
  { name: "notifications_toggle_do_not_disturb", args: {}, tier: "danger", note: "needs a DND keyboard shortcut set up", restore: { name: "notifications_toggle_do_not_disturb", args: {} } },
  // mail (reads; create opens a draft only)
  { name: "mail_list_emails", args: { count: 3 }, tier: "read" },
  { name: "mail_get_email", args: { subject: "" }, tier: "read" },
  { name: "mail_create_email", args: { recipient: "test@example.com", subject: "Jarvis test", body: "Draft only" }, tier: "danger", note: "opens a Mail compose window" },
  // pages
  { name: "pages_create_document", args: { content: "Jarvis self-test document" }, tier: "write", note: "opens Pages with a new doc" },
  // shortcuts
  { name: "shortcuts_list_shortcuts", args: { limit: 5 }, tier: "read" },
  { name: "shortcuts_run_shortcut", args: { name: "Jarvis Test" }, tier: "danger", note: "runs a shortcut by name (edit args to one you actually have)" },
  // messages (reads need Full Disk Access)
  { name: "messages_list_chats", args: {}, tier: "read", note: "needs Full Disk Access" },
  { name: "messages_get_messages", args: { limit: 3 }, tier: "read", note: "needs Full Disk Access" },
  { name: "messages_search_messages", args: { searchText: "the", limit: 3 }, tier: "read", note: "needs Full Disk Access" },
  { name: "messages_compose_message", args: { recipient: "test@example.com", body: "Jarvis test", auto: false }, tier: "danger", note: "opens Messages (auto:false = does NOT send)" },
  // notes
  { name: "notes_list", args: {}, tier: "read" },
  { name: "notes_search", args: { query: "test" }, tier: "read" },
  { name: "notes_get", args: { title: "Jarvis Test Note" }, tier: "read" },
  { name: "notes_create", args: { title: "Jarvis Test Note", content: "Created by test-all" }, tier: "write" },
  { name: "notes_createRawHtml", args: { title: "Jarvis HTML Note", html: "<h1>Hi</h1>" }, tier: "write" },
  // iterm
  { name: "iterm_run", args: { command: "echo jarvis-test" }, tier: "danger", note: "needs iTerm; runs a shell command" },
  { name: "iterm_paste_clipboard", args: {}, tier: "danger", note: "needs iTerm" },
];

function pad(n) { return String(n).padStart(2, "0"); }
function dt(daysFromNow, addHours = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(15 + addHours, 0, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00:00`;
}
function home(sub) { return (process.env.HOME || "~") + "/" + sub; }

// --- run -------------------------------------------------------------------
await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test-all", version: "1.0.0" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

const rows = [];
for (const t of TESTS) {
  const allowed = t.tier === "read" || (t.tier === "write" && runWrites) || (t.tier === "danger" && runDanger);
  if (!allowed) { rows.push({ name: t.name, tier: t.tier, status: "SKIP", detail: t.note || "skipped (raise flag to run)" }); continue; }

  let savedClip = null;
  if (t.clipboardRestore) {
    const g = await callTool("clipboard_get_clipboard", {});
    if (g.ok) savedClip = g.text;
  }

  const r = await callTool(t.name, t.args);
  rows.push({ name: t.name, tier: t.tier, status: r.ok ? "PASS" : "FAIL", detail: short(r.text) });

  if (t.restore) await callTool(t.restore.name, t.restore.args);
  if (t.clipboardRestore && savedClip !== null) await callTool("clipboard_set_clipboard", { content: savedClip });
}

// --- report ----------------------------------------------------------------
const w = Math.max(...rows.map((r) => r.name.length));
console.log("\n" + "TOOL".padEnd(w) + "  TIER    STATUS  DETAIL");
console.log("-".repeat(w + 40));
for (const r of rows) {
  console.log(r.name.padEnd(w) + "  " + r.tier.padEnd(6) + "  " + r.status.padEnd(6) + "  " + r.detail);
}
const c = (s) => rows.filter((r) => r.status === s).length;
console.log("\nPASS: " + c("PASS") + "   FAIL: " + c("FAIL") + "   SKIP: " + c("SKIP") + "   (total " + rows.length + ")");
if (!runWrites) console.log("Run with --writes to include mild write tools, --danger to include destructive ones.");

child.kill();
process.exit(0);
