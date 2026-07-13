// Anthropic (Claude) provider.
//
// A provider owns the LLM call and normalizes it to the shape the agent loop
// expects. To add a new provider (OpenAI, Ollama, …), implement the same two
// methods — `step` and `buildToolResults` — and register it in ./index.mjs.

import Anthropic from "@anthropic-ai/sdk";

/**
 * @param {object}   opts
 * @param {object[]} opts.tools   MCP tool descriptors
 * @param {string}   opts.system  system prompt
 * @param {string}   opts.model
 * @param {number}   opts.maxTokens
 */
export function createAnthropicProvider({ tools, system, model, maxTokens }) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  const claudeTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema ?? { type: "object", properties: {} },
  }));

  return {
    name: "anthropic",
    model,

    /**
     * Advance one turn given the provider-native message history.
     * @returns {Promise<{type:"final",text:string} | {type:"tools",assistantMessage:object,calls:object[]}>}
     */
    async step(messages, systemOverride) {
      const resp = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemOverride ?? system,
        tools: claudeTools,
        messages,
      });

      const calls = resp.content
        .filter((c) => c.type === "tool_use")
        .map((c) => ({ id: c.id, name: c.name, input: c.input }));

      if (calls.length === 0) {
        const text = resp.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(" ")
          .trim();
        return { type: "final", text };
      }

      return { type: "tools", assistantMessage: { role: "assistant", content: resp.content }, calls };
    },

    /**
     * Like step(), but streams assistant text deltas to onText as they arrive.
     * Returns the same normalized turn once the message completes.
     */
    async stream(messages, onText, systemOverride) {
      const s = client.messages.stream({
        model,
        max_tokens: maxTokens,
        system: systemOverride ?? system,
        tools: claudeTools,
        messages,
      });
      if (onText) s.on("text", (delta) => onText(delta));
      const msg = await s.finalMessage();

      const calls = msg.content
        .filter((c) => c.type === "tool_use")
        .map((c) => ({ id: c.id, name: c.name, input: c.input }));

      if (calls.length === 0) {
        const text = msg.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(" ")
          .trim();
        return { type: "final", text };
      }

      return { type: "tools", assistantMessage: { role: "assistant", content: msg.content }, calls };
    },

    /** Wrap tool outputs into the next user message (text or image). */
    buildToolResults(results) {
      return {
        role: "user",
        content: results.map((r) => {
          const o = r.output;
          if (o && typeof o === "object" && o.image) {
            return {
              type: "tool_result",
              tool_use_id: r.id,
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: o.image.mimeType, data: o.image.data },
                },
                { type: "text", text: o.text || "Screenshot." },
              ],
            };
          }
          const text = typeof o === "string" ? o : (o?.text ?? "");
          return { type: "tool_result", tool_use_id: r.id, content: text };
        }),
      };
    },
  };
}
