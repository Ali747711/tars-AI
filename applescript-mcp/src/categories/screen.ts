import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

import { ScriptCategory } from "../types/index.js";

/**
 * Screen capture ("vision"). Returns the screenshot as an image content block
 * so a vision-capable model can actually see what's on screen.
 * (Requires the Screen Recording permission for the host process.)
 */
const execFileAsync = promisify(execFile);

// Anthropic downscales anything larger than this anyway, so a full-resolution
// Retina capture (~2.3MB) is pure upload latency — costly in a voice turn.
const MAX_EDGE_PX = 1568;

export const screenCategory: ScriptCategory = {
  name: "screen",
  description: "Screen capture (vision)",
  scripts: [
    {
      name: "capture",
      description:
        "Capture a screenshot of the current screen so you can see what the user is looking at.",
      schema: { type: "object", properties: {} },
      handler: async () => {
        const file = join(tmpdir(), `jarvis-shot-${randomUUID()}.jpg`);
        try {
          // -x = no capture sound; JPEG keeps the payload small for the model.
          await execFileAsync("screencapture", ["-x", "-t", "jpg", file]);
          // Shrink in place (sips ships with macOS). Best-effort: if it fails,
          // send the full-size capture rather than nothing.
          await execFileAsync("sips", ["-Z", String(MAX_EDGE_PX), file]).catch(() => {});
          const buf = await readFile(file);
          await unlink(file).catch(() => {});
          return {
            content: [
              { type: "image", data: buf.toString("base64"), mimeType: "image/jpeg" },
              { type: "text", text: "Screenshot captured." },
            ],
          };
        } catch (e) {
          return `ERROR: ${(e as Error)?.message ?? String(e)}`;
        }
      },
    },
  ],
};
