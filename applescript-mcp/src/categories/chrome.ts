import { ScriptCategory } from "../types/index.js";
import { asString, asInt } from "../utils/escape.js";

/**
 * Google Chrome control via AppleScript.
 *
 * Chrome ships a scripting dictionary, so we can open URLs, enumerate tabs,
 * and execute JavaScript inside the active tab. The JS-execution tools require
 * Chrome's setting: View > Developer > "Allow JavaScript from Apple Events".
 * If it's disabled, Chrome returns an error which we surface with a hint.
 *
 * All interpolated values (URLs, JS source, queries) are routed through the
 * escape helpers so untrusted content cannot break out of the AppleScript
 * string literal and inject `do shell script`.
 */

/** Wrap a Chrome JS payload so the tab result (or a clear hint) comes back. */
function execJs(js: string): string {
  return `
    tell application "Google Chrome"
      if (count of windows) = 0 then error "No Chrome window is open"
      try
        set theResult to execute active tab of front window javascript "${asString(js)}"
        return theResult as string
      on error errMsg
        return "JavaScript failed: " & errMsg & " (is 'View > Developer > Allow JavaScript from Apple Events' enabled?)"
      end try
    end tell
  `;
}

export const chromeCategory: ScriptCategory = {
  name: "chrome",
  description: "Google Chrome browser control",
  scripts: [
    {
      name: "open_url",
      description: "Open a URL in Google Chrome (new tab by default)",
      schema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to open" },
          newTab: {
            type: "boolean",
            description: "Open in a new tab (true) or reuse the active tab (false). Default true.",
            default: true,
          },
        },
        required: ["url"],
      },
      script: (args) => {
        const url = asString(args.url);
        const reuse = args?.newTab === false;
        return `
          tell application "Google Chrome"
            activate
            if (count of windows) = 0 then make new window
            ${reuse
              ? `set URL of active tab of front window to "${url}"`
              : `tell front window to make new tab with properties {URL:"${url}"}`}
            return "Opened ${url}"
          end tell
        `;
      },
    },
    {
      name: "search_youtube",
      description: "Open a YouTube search in Chrome, optionally sorted by newest upload",
      schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search for on YouTube" },
          latest: {
            type: "boolean",
            description: "Sort results by upload date (newest first). Default true.",
            default: true,
          },
        },
        required: ["query"],
      },
      script: (args) => {
        // Build + URL-encode the search URL in TS so the query is safe as a URL
        // component; asString then makes it safe inside the AppleScript literal.
        const sort = args?.latest === false ? "" : "&sp=CAI%253D";
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
          String(args.query ?? ""),
        )}${sort}`;
        return `
          tell application "Google Chrome"
            activate
            if (count of windows) = 0 then make new window
            tell front window to make new tab with properties {URL:"${asString(url)}"}
            return "Searching YouTube for: ${asString(args.query)}"
          end tell
        `;
      },
    },
    {
      name: "get_active_tab",
      description: "Get the title and URL of Chrome's active tab",
      script: `
        tell application "Google Chrome"
          if (count of windows) = 0 then return "No Chrome window is open"
          set t to title of active tab of front window
          set u to URL of active tab of front window
          return t & " | " & u
        end tell
      `,
    },
    {
      name: "get_tabs",
      description: "List every open tab across all Chrome windows (title | URL per line)",
      script: `
        tell application "Google Chrome"
          if (count of windows) = 0 then return "No Chrome window is open"
          set out to ""
          repeat with w in windows
            repeat with t in tabs of w
              set out to out & (title of t) & " | " & (URL of t) & linefeed
            end repeat
          end repeat
          return out
        end tell
      `,
    },
    {
      name: "run_javascript",
      description:
        "Execute JavaScript in Chrome's active tab and return the result. Requires 'Allow JavaScript from Apple Events'.",
      schema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "JavaScript to run in the active tab. Its final expression is returned.",
          },
        },
        required: ["code"],
      },
      script: (args) => execJs(String(args.code ?? "")),
    },
    {
      name: "get_youtube_results",
      description:
        "Scrape the video titles and links currently shown on a YouTube results/home page in the active tab. Call after search_youtube and a short wait.",
      schema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max number of videos to return (default 10)",
            default: 10,
          },
        },
      },
      script: (args) => {
        const limit = asInt(args?.limit, 10, 1, 50);
        // Single-quoted JS, no backslashes, so it survives asString cleanly.
        const js =
          `JSON.stringify(Array.from(document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer'))` +
          `.slice(0, ${limit}).map(function(r){` +
          `var a = r.querySelector('a#video-title, a#video-title-link');` +
          `return { title: a ? (a.title || a.textContent.trim()) : '', url: a ? a.href : '' };` +
          `}).filter(function(v){ return v.url; }))`;
        return execJs(js);
      },
    },
  ],
};
