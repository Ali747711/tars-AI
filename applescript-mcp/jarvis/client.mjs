// Thin text client for the Jarvis backend (server.mjs). Talks over WebSocket so
// it gets streamed tool steps and interactive confirmations.
//
// Usage:
//   node jarvis/server.mjs        # in one terminal
//   node jarvis/client.mjs        # in another

import WebSocket from "ws";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.JARVIS_PORT || 8787);
const URL = process.env.JARVIS_URL || `ws://localhost:${PORT}`;

const rl = readline.createInterface({ input, output });
const sessionId = randomUUID();
const ws = new WebSocket(URL);

ws.on("error", (e) => {
  console.error(
    `[jarvis] cannot reach the backend at ${URL} (${e.code || e.message}).\n` +
      "         Start it first in another terminal:  node jarvis/server.mjs",
  );
  process.exit(1);
});

let awaitingReply = null; // resolve fn for the current chat turn

ws.on("open", async () => {
  console.error(`[jarvis] connected to ${URL}`);
  loop();
});

ws.on("message", async (raw) => {
  const msg = JSON.parse(raw.toString());
  switch (msg.type) {
    case "step":
      console.error(`  › ${msg.tool} ${JSON.stringify(msg.args)}`);
      break;
    case "confirm": {
      const answer = await rl.question(
        `\n⚠️  Allow "${msg.tool}" ${JSON.stringify(msg.args)} ? [y/N] `,
      );
      ws.send(JSON.stringify({ type: "confirm", id: msg.id, allow: /^y(es)?$/i.test(answer.trim()) }));
      break;
    }
    case "final":
      console.log(`\nJarvis: ${msg.reply}\n`);
      awaitingReply?.();
      break;
    case "error":
      console.error(`[jarvis] error: ${msg.message}`);
      awaitingReply?.();
      break;
  }
});

ws.on("close", () => {
  console.error("[jarvis] disconnected.");
  process.exit(0);
});

async function loop() {
  const line = (await rl.question("\nYou: ")).trim();
  if (!line || /^(exit|quit)$/i.test(line)) {
    ws.close();
    return;
  }
  await new Promise((resolve) => {
    awaitingReply = resolve;
    ws.send(JSON.stringify({ type: "chat", text: line, sessionId }));
  });
  loop();
}
