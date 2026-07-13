// Provider registry. Pick the LLM backend by name so upgrades/swaps are config.
//
// To add a provider: implement { step, buildToolResults } (see anthropic.mjs)
// and add a case here.

import { createAnthropicProvider } from "./anthropic.mjs";

export function createProvider(name, opts) {
  switch (name) {
    case "anthropic":
      return createAnthropicProvider(opts);
    // case "openai":  return createOpenAIProvider(opts);
    // case "ollama":  return createOllamaProvider(opts);
    default:
      throw new Error(`Unknown provider "${name}". Available: anthropic.`);
  }
}
