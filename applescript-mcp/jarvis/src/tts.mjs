// Text-to-speech. Uses ElevenLabs (natural neural voice) when configured, and
// falls back to the built-in macOS `say`. Never throws — speaking is best-effort.

import { spawn } from "node:child_process";
import { platform } from "node:process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.mjs";

let warnedFallback = false;

/** Speak text aloud through the configured engine. Fire-and-forget safe. */
export async function say(text) {
  if (!text || process.env.JARVIS_SILENT === "1") return;

  if (config.tts.engine === "elevenlabs" && config.tts.elevenLabsKey) {
    try {
      await elevenLabsSpeak(text);
      return;
    } catch (e) {
      if (!warnedFallback) {
        console.error(`[jarvis] ElevenLabs TTS failed (${e?.message ?? e}); using macOS say.`);
        warnedFallback = true;
      }
    }
  }
  macSay(text);
}

function macSay(text) {
  if (platform !== "darwin") return;
  const args = config.tts.macVoice ? ["-v", config.tts.macVoice, text] : [text];
  try {
    spawn("say", args, { stdio: "ignore" });
  } catch {
    /* best-effort */
  }
}

async function elevenLabsSpeak(text) {
  const { elevenLabsKey, elevenLabsVoiceId, elevenLabsModel } = config.tts;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: elevenLabsModel,
        voice_settings: {
          stability: config.tts.stability,
          similarity_boost: config.tts.similarity,
          style: config.tts.style,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const file = join(tmpdir(), `jarvis-tts-${randomUUID()}.mp3`);
  await writeFile(file, buf);
  await playFile(file);
  unlink(file).catch(() => {});
}

/**
 * A serialized speaker for streaming: enqueue text chunks and they play in
 * order (the ElevenLabs path awaits playback, so chunks don't overlap). Lets
 * Jarvis start speaking the first sentence while later ones are still arriving.
 */
export function createSpeaker() {
  let chain = Promise.resolve();
  return {
    speak(text) {
      const t = String(text ?? "").trim();
      if (!t) return;
      chain = chain.then(() => say(t)).catch(() => {});
    },
    done() {
      return chain;
    },
  };
}

/** Play an audio file and resolve when done (macOS `afplay`). */
function playFile(file) {
  return new Promise((resolve) => {
    if (platform !== "darwin") return resolve();
    const p = spawn("afplay", [file], { stdio: "ignore" });
    p.on("close", resolve);
    p.on("error", resolve);
  });
}
