// MCP boot smoke-test: spawns the built server, performs the JSON-RPC
// handshake, and lists every registered tool. Run: `node smoke.mjs`
// (requires `npm run build` first). Safe — it never executes a tool.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const child = spawn("node", [join(here, "dist/index.js")], {
  stdio: ["pipe", "pipe", "ignore"],
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

const init = await send(1, "initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke", version: "1.0.0" },
});
console.log("initialize OK ->", JSON.stringify(init.result?.serverInfo));

child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

const tools = await send(2, "tools/list", {});
const names = (tools.result?.tools ?? []).map((t) => t.name);
console.log(`tools/list OK -> ${names.length} tools registered`);
const cats = [...new Set(names.map((n) => n.split("_")[0]))];
console.log("categories:", cats.join(", "));

child.kill();
process.exit(0);
