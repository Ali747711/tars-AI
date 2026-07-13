// Call a single MCP tool end-to-end, the way a real client would.
// Usage:
//   node try-tool.mjs <tool_name> ['<json-args>']
// Examples:
//   node try-tool.mjs calendar_list
//   node try-tool.mjs calendar_add '{"title":"Test event","startDate":"2026-07-12 15:00:00","endDate":"2026-07-12 16:00:00"}'
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const toolName = process.argv[2];
if (!toolName) {
  console.error("Usage: node try-tool.mjs <tool_name> ['<json-args>']");
  process.exit(1);
}
let args = {};
if (process.argv[3]) {
  try { args = JSON.parse(process.argv[3]); }
  catch (e) { console.error("Invalid JSON args:", e.message); process.exit(1); }
}

const here = dirname(fileURLToPath(import.meta.url));
const child = spawn("node", [join(here, "dist/index.js")], {
  stdio: ["pipe", "pipe", "ignore"], // ignore server's stderr logging
});

let buf = "";
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

const send = (id, method, params) =>
  new Promise((r) => {
    pending.set(id, r);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });

await send(1, "initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "try-tool", version: "1.0.0" },
});
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

console.log(`\n> calling ${toolName} with args:`, JSON.stringify(args), "\n");
const res = await send(2, "tools/call", { name: toolName, arguments: args });

if (res.error) {
  console.log("ERROR:", JSON.stringify(res.error, null, 2));
} else {
  const isErr = res.result?.isError ? " (isError=true)" : "";
  const text = (res.result?.content ?? []).map((c) => c.text ?? "").join("\n");
  console.log("RESULT" + isErr + ":\n" + text);
}

child.kill();
process.exit(0);
