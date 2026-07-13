// One-time Telegram login for the account (GramJS) tools.
//
// Usage:
//   1. Get api_id + api_hash from https://my.telegram.org (API development tools)
//   2. npm install   (ensures the `telegram` package is present)
//   3. node telegram-login.mjs
//   4. Enter api_id, api_hash, your phone (+countrycode), the code Telegram
//      sends you, and your 2FA password if you have one.
//
// It writes telegram-auth.json (gitignored) with a reusable session string,
// so you never have to log in again.

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/StringSession.js";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { writeFileSync } from "node:fs";

const rl = readline.createInterface({ input, output });
const ask = (q) => rl.question(q);

const apiId = Number((await ask("api_id: ")).trim());
const apiHash = (await ask("api_hash: ")).trim();

if (!apiId || !apiHash) {
  console.error("api_id and api_hash are required (get them at https://my.telegram.org).");
  process.exit(1);
}

const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 3,
});

await client.start({
  phoneNumber: async () => (await ask("phone (+countrycode…): ")).trim(),
  password: async () => (await ask("2FA password (leave blank if none): ")).trim(),
  phoneCode: async () => (await ask("login code you received: ")).trim(),
  onError: (err) => console.error("Login error:", err?.message ?? err),
});

const session = client.session.save();
const authPath = new URL("./telegram-auth.json", import.meta.url);
writeFileSync(authPath, JSON.stringify({ apiId, apiHash, session }, null, 2));

console.log("\n✓ Logged in. Saved credentials + session to telegram-auth.json");
console.log("  The telegram_api tools will now work. Keep this file private.");

await client.disconnect();
rl.close();
process.exit(0);
