import { ScriptCategory } from "../types/index.js";
import { asInt } from "../utils/escape.js";
import { getClient } from "../telegram/client.js";

/**
 * Telegram account tools backed by the GramJS (MTProto) client — NOT
 * AppleScript. These read and search real account data (dialogs, messages,
 * channels, groups) and send messages reliably. Each tool uses a `handler`
 * so the framework runs it directly instead of osascript.
 *
 * Requires a one-time login: `node telegram-login.mjs` (see README/setup).
 */

/** Normalise a peer reference: '@name' → 'name'; leaves ids/usernames intact. */
function cleanPeer(peer: unknown): string {
  const s = String(peer ?? "").trim();
  if (!s) throw new Error("A `peer` (username, @handle, or id) is required");
  return s.startsWith("@") ? s.slice(1) : s;
}

/** GramJS entities are loosely typed; read a field defensively. */
function field<T = unknown>(obj: unknown, key: string): T | undefined {
  return obj && typeof obj === "object" ? ((obj as Record<string, unknown>)[key] as T) : undefined;
}

export const telegramApiCategory: ScriptCategory = {
  name: "telegramapi",
  description: "Telegram account (read/search chats, groups, channels via GramJS)",
  scripts: [
    {
      name: "list_dialogs",
      description:
        "List your Telegram conversations (users, groups, channels) with names, ids, @usernames, and unread counts.",
      schema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max dialogs to return (default 30)", default: 30 },
          type: {
            type: "string",
            enum: ["all", "user", "group", "channel"],
            description: "Filter by conversation type (default all)",
            default: "all",
          },
        },
      },
      handler: async (args) => {
        const client = await getClient();
        const limit = asInt(args?.limit, 30, 1, 200);
        const type = args?.type ?? "all";
        const dialogs = await client.getDialogs({ limit });

        const rows = [];
        for (const d of dialogs) {
          const kind = d.isUser ? "user" : d.isGroup ? "group" : d.isChannel ? "channel" : "other";
          if (type !== "all" && kind !== type) continue;
          const username = field<string>(d.entity, "username");
          rows.push({
            name: d.name ?? d.title ?? "",
            kind,
            id: d.id ? String(d.id) : null,
            username: username ? "@" + username : null,
            unread: d.unreadCount ?? 0,
          });
        }
        return JSON.stringify(rows, null, 2);
      },
    },
    {
      name: "get_messages",
      description:
        "Read the most recent messages from a chat, group, or channel. `peer` is an @username or id.",
      schema: {
        type: "object",
        properties: {
          peer: { type: "string", description: "@username, phone, or numeric id of the chat/channel" },
          limit: { type: "number", description: "Max messages to return (default 20)", default: 20 },
        },
        required: ["peer"],
      },
      handler: async (args) => {
        const client = await getClient();
        const peer = cleanPeer(args?.peer);
        const limit = asInt(args?.limit, 20, 1, 100);
        const msgs = await client.getMessages(peer, { limit });

        const rows = msgs.map((m) => ({
          id: m.id,
          date: m.date ? new Date(m.date * 1000).toISOString() : null,
          senderId: m.senderId ? String(m.senderId) : null,
          outgoing: !!m.out,
          text: m.message || (m.media ? "[media]" : ""),
        }));
        return JSON.stringify(rows, null, 2);
      },
    },
    {
      name: "search_messages",
      description: "Search for text within a specific chat, group, or channel.",
      schema: {
        type: "object",
        properties: {
          peer: { type: "string", description: "@username, phone, or id to search within" },
          query: { type: "string", description: "Text to search for" },
          limit: { type: "number", description: "Max results (default 20)", default: 20 },
        },
        required: ["peer", "query"],
      },
      handler: async (args) => {
        const client = await getClient();
        const peer = cleanPeer(args?.peer);
        const query = String(args?.query ?? "");
        const limit = asInt(args?.limit, 20, 1, 100);
        const msgs = await client.getMessages(peer, { limit, search: query });

        const rows = msgs.map((m) => ({
          id: m.id,
          date: m.date ? new Date(m.date * 1000).toISOString() : null,
          senderId: m.senderId ? String(m.senderId) : null,
          text: m.message || "",
        }));
        return JSON.stringify({ query, count: rows.length, results: rows }, null, 2);
      },
    },
    {
      name: "get_entity_info",
      description:
        "Get details about a user, group, or channel by @username or id (title, type, member count, verification).",
      schema: {
        type: "object",
        properties: {
          peer: { type: "string", description: "@username, phone, or numeric id" },
        },
        required: ["peer"],
      },
      handler: async (args) => {
        const client = await getClient();
        const peer = cleanPeer(args?.peer);
        const ent = await client.getEntity(peer);

        const first = field<string>(ent, "firstName");
        const last = field<string>(ent, "lastName");
        const title = field<string>(ent, "title") ?? ([first, last].filter(Boolean).join(" ") || null);

        return JSON.stringify(
          {
            id: field(ent, "id") ? String(field(ent, "id")) : null,
            type: field<string>(ent, "className") ?? null,
            title,
            username: field<string>(ent, "username") ? "@" + field<string>(ent, "username") : null,
            phone: field<string>(ent, "phone") ?? null,
            participants: field<number>(ent, "participantsCount") ?? null,
            verified: field<boolean>(ent, "verified") ?? false,
            bot: field<boolean>(ent, "bot") ?? false,
          },
          null,
          2,
        );
      },
    },
    {
      name: "send_message",
      description: "Send a message to a chat, group, or channel via the Telegram account API (reliable).",
      schema: {
        type: "object",
        properties: {
          peer: { type: "string", description: "@username, phone, or id of the recipient" },
          message: { type: "string", description: "Text to send (supports multiple lines)" },
        },
        required: ["peer", "message"],
      },
      handler: async (args) => {
        const client = await getClient();
        const peer = cleanPeer(args?.peer);
        const message = String(args?.message ?? "");
        if (!message) throw new Error("`message` is required");
        const sent = await client.sendMessage(peer, { message });
        return `Sent to ${peer} (message id ${sent.id})`;
      },
    },
  ],
};
