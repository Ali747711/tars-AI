// Standalone Jarvis CLI — runs the agent in-process (no backend server needed).
// Handy for quick use and debugging. For the always-on service + thin clients,
// use server.mjs instead.
//
// Usage:
//   node jarvis/brain.mjs "open youtube and search for the latest claude videos"
//   node jarvis/brain.mjs            # interactive REPL

import readline from "node:readline/promises";
import { stdin as input, stdout as output, argv } from "node:process";

import { config } from "./src/config.mjs";
import { createMcp } from "./src/mcp.mjs";
import { createProvider } from "./src/providers/index.mjs";
import { createAgent } from "./src/agent.mjs";
import { say } from "./src/tts.mjs";

async function cliConfirm(tool, args) {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(
    `\n⚠️  Run "${tool}" with ${JSON.stringify(args)} ? [y/N] `,
  );
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  if (config.provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY first (export ANTHROPIC_API_KEY=...).");
    process.exit(1);
  }

  const mcp = await createMcp();
  const provider = createProvider(config.provider, {
    tools: mcp.tools,
    system: config.systemPrompt,
    model: config.model,
    maxTokens: config.maxTokens,
  });
  const agent = createAgent({ mcp, provider });
  console.error(`[jarvis] ready — ${mcp.tools.length} tools, model ${config.model}`);

  const history = [];
  const handle = async (text) => {
    const { reply } = await agent.run(text, {
      history,
      confirm: cliConfirm,
      onStep: (name, args) => console.error(`  › ${name} ${JSON.stringify(args)}`),
    });
    console.log(`\nJarvis: ${reply}\n`);
    say(reply);
  };

  const oneShot = argv.slice(2).join(" ").trim();
  if (oneShot) {
    await handle(oneShot);
    await mcp.close();
    process.exit(0);
  }

  const rl = readline.createInterface({ input, output });
  console.error('[jarvis] interactive — type a request, or "exit" to quit.');
  while (true) {
    const line = (await rl.question("\nYou: ")).trim();
    if (!line || /^(exit|quit)$/i.test(line)) break;
    await handle(line);
  }
  rl.close();
  await mcp.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("[jarvis] fatal:", e?.message ?? e);
  process.exit(1);
});
