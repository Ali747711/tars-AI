import type { TelegramClient } from "telegram";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Lazy, shared GramJS (MTProto) client for the Telegram account tools.
 *
 * Credentials are read from, in order:
 *   1. env: TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION
 *   2. telegram-auth.json in the repo root (written by `telegram-login.mjs`)
 *
 * The `telegram` package is imported dynamically so the rest of the MCP server
 * still boots even if GramJS isn't installed or isn't configured — only the
 * telegram_api tools fail, with a clear message.
 */

const here = dirname(fileURLToPath(import.meta.url));
// Compiled location is dist/telegram/client.js → repo root is two levels up.
const AUTH_FILE = join(here, "..", "..", "telegram-auth.json");

interface TgConfig {
  apiId: number;
  apiHash: string;
  session: string;
}

function loadConfig(): TgConfig | null {
  const { TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION } = process.env;
  if (TELEGRAM_API_ID && TELEGRAM_API_HASH && TELEGRAM_SESSION) {
    return {
      apiId: Number(TELEGRAM_API_ID),
      apiHash: TELEGRAM_API_HASH,
      session: TELEGRAM_SESSION,
    };
  }

  if (existsSync(AUTH_FILE)) {
    try {
      const j = JSON.parse(readFileSync(AUTH_FILE, "utf8"));
      if (j.apiId && j.apiHash && j.session) {
        return {
          apiId: Number(j.apiId),
          apiHash: String(j.apiHash),
          session: String(j.session),
        };
      }
    } catch {
      // fall through to "not configured"
    }
  }
  return null;
}

/** True when API credentials + a saved session are available. */
export function isConfigured(): boolean {
  return loadConfig() !== null;
}

let clientPromise: Promise<TelegramClient> | null = null;

/**
 * Returns a connected TelegramClient, creating and connecting it on first use.
 * Throws a descriptive error if Telegram hasn't been configured yet.
 */
export function getClient(): Promise<TelegramClient> {
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const cfg = loadConfig();
    if (!cfg) {
      throw new Error(
        "Telegram is not configured. Run `node telegram-login.mjs` once to create telegram-auth.json, " +
          "or set TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION.",
      );
    }

    const { TelegramClient } = await import("telegram");
    const { StringSession } = await import("telegram/sessions/StringSession.js");

    const client = new TelegramClient(
      new StringSession(cfg.session),
      cfg.apiId,
      cfg.apiHash,
      { connectionRetries: 3 },
    );

    await client.connect();
    return client;
  })();

  // On failure, clear the cache so a later call can retry.
  clientPromise.catch(() => {
    clientPromise = null;
  });

  return clientPromise;
}
