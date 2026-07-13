// Jarvis backend: a long-running Node service that holds the MCP connection and
// the Claude agent, exposing REST + WebSocket. Clients (CLI, voice, web UI)
// stay thin and just talk to this.
//
//   REST
//     GET  /health                 → status
//     GET  /tools                  → tool catalog (name/desc/schema/confirm)
//     POST /tool {name,args}        → direct tool execution (tool palette)
//     POST /chat {text,...}         → run a turn
//     GET  /routines               → scheduled routines
//     POST /routines {name,cron,prompt}  → create a routine
//     POST /routines/:id/toggle    → enable/disable
//     DELETE /routines/:id         → remove
//     GET  /log?day=YYYY-MM-DD     → activity log
//   WebSocket (streaming + interactive confirm)
//     → {type:"chat", text, sessionId?}
//     ← {type:"token"|"step"|"confirm"|"final"|"error", ...}
//
// Env: see src/config.mjs. Requires ANTHROPIC_API_KEY for the default provider.

import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

import { config } from "./src/config.mjs";
import { createMcp, resultToText } from "./src/mcp.mjs";
import { createProvider } from "./src/providers/index.mjs";
import { createAgent } from "./src/agent.mjs";
import { say, createSpeaker } from "./src/tts.mjs";
import { memoryTools, promptBlock } from "./src/memory.mjs";
import { createScheduler } from "./src/scheduler.mjs";
import { readJson, writeJsonDebounced, appendLog, readLog } from "./src/store.mjs";

async function boot() {
  if (config.provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    console.error("[jarvis] warning: ANTHROPIC_API_KEY is not set — /chat will fail.");
  }

  const mcp = await createMcp();

  // Backend-local tools (run in-process, not via the MCP server): memory + a
  // tool to create scheduled routines by voice. `scheduler` is filled in below.
  let scheduler;
  const routineTool = {
    name: "routine_create",
    description:
      "Create a scheduled routine that runs a prompt automatically. `cron` is a 5-field cron expression (min hour day month weekday), e.g. '45 8 * * 1-5' = 8:45am on weekdays.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short name for the routine" },
        cron: { type: "string", description: "5-field cron expression" },
        prompt: { type: "string", description: "What Jarvis should do when it runs" },
      },
      required: ["cron", "prompt"],
    },
    handler: (a) => {
      const r = scheduler.add({ name: a?.name, cron: a?.cron, prompt: a?.prompt });
      return `Routine "${r.name}" scheduled (${r.cron}).`;
    },
  };

  const localToolDefs = [...memoryTools, routineTool];
  const localTools = Object.fromEntries(localToolDefs.map((t) => [t.name, t.handler]));
  const localDescriptors = localToolDefs.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));

  const provider = createProvider(config.provider, {
    tools: [...mcp.tools, ...localDescriptors],
    system: config.systemPrompt,
    model: config.model,
    maxTokens: config.maxTokens,
  });
  const agent = createAgent({ mcp, provider, localTools });

  // System prompt is rebuilt each turn so remembered facts stay current.
  const systemFor = () => config.systemPrompt + promptBlock();

  // Routines run unattended: never auto-confirm outbound/destructive tools.
  async function runPrompt(prompt) {
    try {
      const { reply, steps } = await agent.run(prompt, {
        history: [],
        confirm: async () => false,
        system: systemFor(),
      });
      say(reply);
      appendLog({ ts: Date.now(), kind: "routine", user: prompt, steps, reply });
    } catch (e) {
      console.error("[jarvis] routine run failed:", e?.message ?? e);
    }
  }
  scheduler = createScheduler({ runPrompt });

  // Sessions persist across restarts.
  const sessions = new Map(Object.entries(readJson("sessions.json", {})));
  const saveSessions = () => writeJsonDebounced("sessions.json", Object.fromEntries(sessions));

  console.error(
    `[jarvis] backend ready — ${mcp.tools.length} tools (+${localDescriptors.length} local), ` +
      `provider ${provider.name}, model ${config.model}, ${sessions.size} session(s)`,
  );

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", process.env.JARVIS_CORS_ORIGIN || "*");
    res.header("Access-Control-Allow-Headers", "content-type");
    res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      provider: provider.name,
      model: config.model,
      tools: mcp.tools.length,
      sessions: sessions.size,
      routines: scheduler.list().length,
    });
  });

  app.get("/tools", (_req, res) => {
    res.json(
      mcp.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema ?? { type: "object", properties: {} },
        confirm: config.confirmTools.has(t.name),
      })),
    );
  });

  app.post("/tool", async (req, res) => {
    const { name, args = {}, confirm = false } = req.body ?? {};
    const tool = mcp.tools.find((t) => t.name === name);
    if (!tool) return res.status(404).json({ error: `unknown tool: ${name}` });
    if (config.confirmTools.has(name) && confirm !== true) {
      return res.status(403).json({ error: "confirmation required", confirm: true });
    }
    try {
      res.json({ name, output: resultToText(await mcp.call(name, args)) });
    } catch (e) {
      res.status(500).json({ error: e?.message ?? String(e) });
    }
  });

  app.post("/chat", async (req, res) => {
    const { text, sessionId, autoConfirm = false, speak = true } = req.body ?? {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "body must include a `text` string" });
    }
    const id = sessionId || randomUUID();
    const history = sessions.get(id) ?? [];
    try {
      const { reply, history: newHistory, steps } = await agent.run(text, {
        history,
        confirm: async () => autoConfirm === true,
        system: systemFor(),
      });
      sessions.set(id, newHistory);
      saveSessions();
      appendLog({ ts: Date.now(), sessionId: id, user: text, steps, reply });
      if (speak) say(reply);
      res.json({ sessionId: id, reply, steps });
    } catch (e) {
      res.status(500).json({ error: e?.message ?? String(e) });
    }
  });

  // Routines
  app.get("/routines", (_req, res) => res.json(scheduler.list()));
  app.post("/routines", (req, res) => {
    const { name, cron, prompt } = req.body ?? {};
    if (!cron || !prompt) return res.status(400).json({ error: "cron and prompt are required" });
    try {
      res.json(scheduler.add({ name, cron, prompt }));
    } catch (e) {
      res.status(400).json({ error: e?.message ?? String(e) });
    }
  });
  app.post("/routines/:id/toggle", (req, res) => {
    scheduler.toggle(req.params.id);
    res.json({ ok: true });
  });
  app.delete("/routines/:id", (req, res) => {
    scheduler.remove(req.params.id);
    res.json({ ok: true });
  });

  // Activity log
  app.get("/log", (req, res) => res.json(readLog(req.query.day, Number(req.query.limit) || 200)));

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws) => {
    const pending = new Map();

    const confirm = (tool, args) =>
      new Promise((resolve) => {
        const id = randomUUID();
        pending.set(id, resolve);
        say(`I need your OK to run ${tool}.`);
        ws.send(JSON.stringify({ type: "confirm", id, tool, args }));
        setTimeout(() => {
          if (pending.delete(id)) resolve(false);
        }, 120_000);
      });

    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return ws.send(JSON.stringify({ type: "error", message: "invalid JSON" }));
      }

      if (msg.type === "confirm" && msg.id) {
        const resolve = pending.get(msg.id);
        if (resolve) {
          pending.delete(msg.id);
          resolve(!!msg.allow);
        }
        return;
      }

      if (msg.type === "chat" && msg.text) {
        const id = msg.sessionId || randomUUID();
        const history = sessions.get(id) ?? [];
        const wantSpeak = msg.speak !== false;
        const speaker = wantSpeak ? createSpeaker() : null;

        let sentenceBuf = "";
        let streamedAny = false;
        const flushSentence = () => {
          const s = sentenceBuf.trim();
          sentenceBuf = "";
          if (s) speaker?.speak(s);
        };
        const onToken = (delta) => {
          streamedAny = true;
          ws.send(JSON.stringify({ type: "token", text: delta }));
          if (!speaker) return;
          sentenceBuf += delta;
          const parts = sentenceBuf.split(/(?<=[.!?…])\s+/);
          sentenceBuf = parts.pop() ?? "";
          for (const s of parts) speaker.speak(s);
        };

        try {
          const { reply, history: newHistory, steps } = await agent.run(msg.text, {
            history,
            confirm,
            onToken,
            system: systemFor(),
            onStep: (tool, args) => {
              flushSentence();
              ws.send(JSON.stringify({ type: "step", tool, args }));
            },
          });
          sessions.set(id, newHistory);
          saveSessions();
          appendLog({ ts: Date.now(), sessionId: id, user: msg.text, steps, reply });
          if (speaker) flushSentence();
          if (wantSpeak && !streamedAny) say(reply);
          ws.send(JSON.stringify({ type: "final", reply, sessionId: id }));
        } catch (e) {
          ws.send(JSON.stringify({ type: "error", message: e?.message ?? String(e) }));
        }
        return;
      }

      ws.send(JSON.stringify({ type: "error", message: "unknown message type" }));
    });
  });

  httpServer.listen(config.port, () => {
    console.error(`[jarvis] listening on http://localhost:${config.port}`);
  });

  const shutdown = async () => {
    console.error("\n[jarvis] shutting down…");
    await mcp.close();
    httpServer.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

boot().catch((e) => {
  console.error("[jarvis] fatal:", e?.message ?? e);
  process.exit(1);
});
