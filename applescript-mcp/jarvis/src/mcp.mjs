// Thin wrapper around the MCP client that spawns and drives the applescript-mcp
// server over stdio.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { config } from "./config.mjs";

/** Extract an image content block from an MCP tool result, if present. */
export function extractImage(result) {
  const img = (result?.content ?? []).find((c) => c?.type === "image");
  if (!img) return null;
  return { mimeType: img.mimeType || "image/png", data: img.data };
}

/** Flatten an MCP tool result's content array to plain text. */
export function resultToText(result) {
  const text = (result?.content ?? [])
    .map((c) => (c?.type === "text" ? c.text : `[${c?.type ?? "unknown"}]`))
    .join("\n")
    .trim();
  return result?.isError ? `ERROR: ${text || "tool failed"}` : text || "(no output)";
}

/**
 * Spawn the MCP server and connect a client to it.
 * @returns {Promise<{tools:object[], call:Function, close:Function}>}
 */
export async function createMcp() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [config.serverEntry],
    stderr: "ignore",
  });
  const client = new Client({ name: "jarvis-backend", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  const { tools } = await client.listTools();

  return {
    tools,
    call: (name, args) => client.callTool({ name, arguments: args ?? {} }),
    close: () => client.close().catch(() => {}),
  };
}
