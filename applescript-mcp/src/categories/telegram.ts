import { ScriptCategory } from "../types/index.js";
import { asString } from "../utils/escape.js";

/**
 * Telegram control via UI scripting.
 *
 * Telegram for macOS ships NO AppleScript dictionary, so we drive it two ways:
 *   1. The `tg://resolve?domain=<username>` URL scheme jumps straight to a
 *      public username's chat — reliable, no guessing at UI layout.
 *   2. System Events UI scripting (keystrokes) types and sends the message,
 *      and is also the fallback for contacts that have no @username (search
 *      by display name).
 *
 * Requirements on the Mac:
 *   - Accessibility permission for whatever process runs this server
 *     (System Settings > Privacy & Security > Accessibility).
 *   - Telegram installed and logged in.
 *
 * Because UI scripting depends on timing and Telegram's current layout, the
 * `delay` values below may need tuning on a slow machine. Sending is
 * irreversible, so `send: false` types the message but stops before Enter.
 *
 * All interpolated values are escaped so message/username content cannot break
 * out of the AppleScript string literal.
 */

/** Collapse newlines to spaces: Enter sends in Telegram, so multiline can't be typed. */
function oneLine(value: unknown): string {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

const APP = "Telegram";

export const telegramCategory: ScriptCategory = {
  name: "telegram",
  description: "Telegram messaging (UI scripting)",
  scripts: [
    {
      name: "send_message",
      description:
        "Send a Telegram message. Prefer `username` (public @handle) for reliability; use `contact` (display name) to search when there's no username. Set send=false to type without sending.",
      schema: {
        type: "object",
        properties: {
          message: { type: "string", description: "The text to send (single line; Enter sends)" },
          username: {
            type: "string",
            description: "Public Telegram @username of the recipient (without the @), e.g. 'durov'",
          },
          contact: {
            type: "string",
            description: "Display name to search for when the recipient has no public username",
          },
          send: {
            type: "boolean",
            description: "Actually press Enter to send (true) or just type the draft (false). Default true.",
            default: true,
          },
        },
        required: ["message"],
      },
      script: (args) => {
        const message = oneLine(args.message);
        const username = String(args.username ?? "").replace(/^@/, "").trim();
        const contact = oneLine(args.contact);
        const doSend = args?.send !== false;
        const sendStep = doSend ? `key code 36 -- Return: send` : `-- send=false: left as draft`;

        if (!username && !contact) {
          return `return "Error: provide either a username or a contact name"`;
        }

        if (username) {
          const url = `tg://resolve?domain=${encodeURIComponent(username)}`;
          return `
            tell application "${APP}" to activate
            delay 0.6
            open location "${asString(url)}"
            delay 1.5
            tell application "System Events"
              tell process "${APP}"
                set frontmost to true
                delay 0.3
                keystroke "${asString(message)}"
                delay 0.3
                ${sendStep}
              end tell
            end tell
            return "${doSend ? "Sent to @" : "Drafted to @"}${asString(username)}: ${asString(message)}"
          `;
        }

        // Contact path: open global search, type the name, open first result, send.
        // ⌘K is Telegram-macOS global search; adjust here if your build differs.
        return `
          tell application "${APP}" to activate
          delay 0.6
          tell application "System Events"
            tell process "${APP}"
              set frontmost to true
              keystroke "k" using command down
              delay 0.5
              keystroke "${asString(contact)}"
              delay 1.0
              key code 36 -- open first search result
              delay 0.8
              keystroke "${asString(message)}"
              delay 0.3
              ${sendStep}
            end tell
          end tell
          return "${doSend ? "Sent to " : "Drafted to "}${asString(contact)}: ${asString(message)}"
        `;
      },
    },
    {
      name: "open_chat",
      description: "Open a Telegram chat by public @username (without sending anything)",
      schema: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "Public Telegram @username to open (without the @)",
          },
        },
        required: ["username"],
      },
      script: (args) => {
        const username = String(args.username ?? "").replace(/^@/, "").trim();
        const url = `tg://resolve?domain=${encodeURIComponent(username)}`;
        return `
          tell application "${APP}" to activate
          delay 0.4
          open location "${asString(url)}"
          return "Opened chat with @${asString(username)}"
        `;
      },
    },
  ],
};
