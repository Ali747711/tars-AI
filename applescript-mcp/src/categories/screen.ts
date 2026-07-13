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
