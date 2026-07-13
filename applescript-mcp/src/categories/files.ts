import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, readdir, stat } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

import { ScriptCategory } from "../types/index.js";

/**
 * File and Spotlight tools. Implemented as `handler` tools (Node, not
 * AppleScript): they shell out with argument arrays via execFile — never string
 * interpolation — so untrusted values can't be injected into a shell. All tools
 * are read-only or open-only; nothing here writes or deletes.
 */

const execFileAsync = promisify(execFile);

/** Expand a leading ~ to the user's home directory. */
function expandHome(p: string): string {
  const s = String(p ?? "").trim();
  if (s === "~") return homedir();
  if (s.startsWith("~/")) return join(homedir(), s.slice(2));
  return s;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export const filesCategory: ScriptCategory = {
  name: "files",
  description: "File search and access (Spotlight)",
  scripts: [
    {
      name: "search",
      description: "Search files with Spotlight (mdfind). Returns matching file paths.",
      schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search text" },
          onlyName: {
            type: "boolean",
            description: "Match the filename only (default false = match content too)",
            default: false,
          },
          limit: { type: "number", description: "Max results (default 20)", default: 20 },
        },
        required: ["query"],
      },
      handler: async (args) => {
        const query = String(args?.query ?? "").trim();
        if (!query) return "No query provided.";
        const limit = clampInt(args?.limit, 20, 1, 100);
        const cmdArgs = args?.onlyName ? ["-name", query] : [query];
        try {
          const { stdout } = await execFileAsync("mdfind", cmdArgs, { maxBuffer: 4 * 1024 * 1024 });
          const lines = stdout.split("\n").filter(Boolean).slice(0, limit);
          return lines.length ? lines.join("\n") : "No matches found.";
        } catch (e) {
          return `ERROR: ${(e as Error)?.message ?? String(e)}`;
        }
      },
    },
    {
      name: "recent_downloads",
      description: "List the most recently modified files in ~/Downloads.",
      schema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max files (default 10)", default: 10 },
        },
      },
      handler: async (args) => {
        const limit = clampInt(args?.limit, 10, 1, 50);
        const dir = join(homedir(), "Downloads");
        try {
          const names = await readdir(dir);
          const entries = await Promise.all(
            names.map(async (name) => {
              try {
                const s = await stat(join(dir, name));
                return { name, mtime: s.mtimeMs, size: s.size, isFile: s.isFile() };
              } catch {
                return null;
              }
            }),
          );
          const rows = entries
            .filter((e): e is NonNullable<typeof e> => !!e && e.isFile)
            .sort((a, b) => b.mtime - a.mtime)
            .slice(0, limit)
            .map((e) => `${new Date(e.mtime).toISOString()}  ${formatSize(e.size)}  ${e.name}`);
          return rows.length ? rows.join("\n") : "Downloads folder is empty.";
        } catch (e) {
          return `ERROR: ${(e as Error)?.message ?? String(e)}`;
        }
      },
    },
    {
      name: "open",
      description: "Open a file or folder with its default app.",
      schema: {
        type: "object",
        properties: { path: { type: "string", description: "File or folder path" } },
        required: ["path"],
      },
      handler: async (args) => {
        const path = expandHome(String(args?.path ?? ""));
        if (!path) return "No path provided.";
        try {
          await execFileAsync("open", [path]);
          return `Opened ${path}`;
        } catch (e) {
          return `ERROR: ${(e as Error)?.message ?? String(e)}`;
        }
      },
    },
    {
      name: "reveal",
      description: "Reveal a file or folder in Finder.",
      schema: {
        type: "object",
        properties: { path: { type: "string", description: "File or folder path" } },
        required: ["path"],
      },
      handler: async (args) => {
        const path = expandHome(String(args?.path ?? ""));
        if (!path) return "No path provided.";
        try {
          await execFileAsync("open", ["-R", path]);
          return `Revealed ${path} in Finder`;
        } catch (e) {
          return `ERROR: ${(e as Error)?.message ?? String(e)}`;
        }
      },
    },
    {
      name: "read_text",
      description: "Read a UTF-8 text file (truncated). For plain-text files only.",
      schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Text file path" },
          maxChars: { type: "number", description: "Max characters to return (default 4000)", default: 4000 },
        },
        required: ["path"],
      },
      handler: async (args) => {
        const path = expandHome(String(args?.path ?? ""));
        if (!path) return "No path provided.";
        const maxChars = clampInt(args?.maxChars, 4000, 100, 20000);
        try {
          const text = await readFile(path, "utf8");
          return text.length > maxChars ? text.slice(0, maxChars) + "\n…[truncated]" : text;
        } catch (e) {
          return `ERROR: ${(e as Error)?.message ?? String(e)}`;
        }
      },
    },
  ],
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}
