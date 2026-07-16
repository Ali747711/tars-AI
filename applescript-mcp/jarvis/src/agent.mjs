// Provider-agnostic agent loop. Runs Claude (or any provider) against the MCP
// tools plus backend-local tools (memory, routines), gating configured tools
// behind an async confirm callback and keeping conversation history.
//
// Hardening: the loop is capped at config.maxSteps rounds (then it forces a
// final answer), every MCP tool call is bounded by config.toolTimeoutMs, and a
// timed-out AppleScript call is retried once.

import { resultToText, extractImage } from "./mcp.mjs";
import { config } from "./config.mjs";

/** Run an MCP tool with a hard timeout so a hung AppleScript can't wedge the session. */
function callWithTimeout(mcp, name, args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`tool timed out after ${config.toolTimeoutMs}ms`)),
      config.toolTimeoutMs,
    );
    mcp.call(name, args).then(
      (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Execute an MCP tool, bounded + retried once on timeout. Returns
 * { text, image? } so image results (screenshots) survive to the provider.
 */
async function runMcpTool(mcp, name, args) {
  const once = async () => {
    const r = await callWithTimeout(mcp, name, args);
    const image = extractImage(r);
    const text = resultToText(r);
    return image ? { text, image } : { text };
  };
  try {
    return await once();
  } catch (e) {
    const msg = e?.message ?? String(e);
    if (/timed out|timeout|-1712/i.test(msg)) {
      try {
        return await once();
      } catch (e2) {
        return { text: `ERROR: ${e2?.message ?? String(e2)}` };
      }
    }
    return { text: `ERROR: ${msg}` };
  }
}

/**
 * @param {object} deps
 * @param {object} deps.mcp                    from createMcp()
 * @param {object} deps.provider               from createProvider()
 * @param {Record<string,Function>} [deps.localTools]  name -> handler(args)=>string, run in-process
 */
export function createAgent({ mcp, provider, localTools = {} }) {
  async function execTool(name, args) {
    if (localTools[name]) {
      try {
        return String(await localTools[name](args ?? {}));
      } catch (e) {
        return `ERROR: ${e?.message ?? String(e)}`;
      }
    }
    return runMcpTool(mcp, name, args);
  }

  /**
   * Run one user turn to completion (through any number of tool calls).
   *
   * @param {string} text
   * @param {object} [opts]
   * @param {object[]} [opts.history]
   * @param {(tool:string,args:object)=>void} [opts.onStep]
   * @param {(tool:string,args:object)=>Promise<boolean>} [opts.confirm]
   * @param {(delta:string)=>void} [opts.onToken]
   * @param {string} [opts.system]  system-prompt override for this turn
   * @returns {Promise<{reply:string, history:object[], steps:object[]}>}
   */
  async function run(text, { history = [], onStep, confirm, onToken, system } = {}) {
    const messages = history;
    const steps = [];
    messages.push({ role: "user", content: text });

    const advance = (msgs) =>
      typeof provider.stream === "function" && onToken
        ? provider.stream(msgs, onToken, system)
        : provider.step(msgs, system);

    for (let round = 0; round < config.maxSteps; round++) {
      const turn = await advance(messages);

      if (turn.type === "final") {
        // Keep Jarvis's own reply in history — without it, later turns can't
        // reference what was said and cross-session continuity breaks.
        messages.push({ role: "assistant", content: turn.text });
        return { reply: turn.text, history: messages, steps };
      }

      messages.push(turn.assistantMessage);

      const results = [];
      for (const call of turn.calls) {
        onStep?.(call.name, call.input);

        if (config.confirmTools.has(call.name) && confirm) {
          const ok = await confirm(call.name, call.input);
          if (!ok) {
            steps.push({ tool: call.name, args: call.input, output: "declined", ms: 0 });
            results.push({ id: call.id, output: "User declined this action. Do not retry it." });
            continue;
          }
        }

        const t0 = Date.now();
        const out = await execTool(call.name, call.input);
        const outText = typeof out === "string" ? out : out.text;
        steps.push({
          tool: call.name,
          args: call.input,
          output: String(outText).slice(0, 500),
          ms: Date.now() - t0,
        });
        results.push({ id: call.id, output: out });
      }

      messages.push(provider.buildToolResults(results));
    }

    // Step cap hit — ask for a final answer with an ephemeral nudge so the
    // persisted history isn't corrupted.
    const nudged = [
      ...messages,
      { role: "user", content: "Stop calling tools and give your brief final answer now." },
    ];
    const finalTurn = await advance(nudged);
    const reply =
      finalTurn.type === "final"
        ? finalTurn.text
        : "I ran out of steps before I could finish that, sir.";
    messages.push({ role: "assistant", content: reply });
    return { reply, history: messages, steps };
  }

  return { run };
}
