// Jarvis wake-word voice client: always-listening "Jarvis" detection with
// barge-in, replacing push-to-talk.
//
// Pipeline: PvRecorder mic frames → Porcupine ("Jarvis" wake word) → record
// until silence (energy VAD) → whisper.cpp transcription → backend over
// WebSocket (speak:false) → local, killable TTS. Saying "Jarvis" again while
// Jarvis is speaking barges in (kills playback and listens).
//
// Prerequisites (macOS):
//   brew install whisper-cpp
//   curl -L -o ~/ggml-base.en.bin \
//     https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
//   A free Picovoice access key from https://console.picovoice.ai
//
// Env: PICOVOICE_ACCESS_KEY (required), WHISPER_BIN, WHISPER_MODEL,
//      JARVIS_URL / JARVIS_PORT. TTS reuses your ELEVENLABS_* / JARVIS_VOICE.
//
// Run the backend first, then: node jarvis/voice-wake.mjs

import { Porcupine, BuiltinKeyword } from "@picovoice/porcupine-node";
import { PvRecorder } from "@picovoice/pvrecorder-node";
import WebSocket from "ws";
import { spawn, execFile } from "node:child_process";
import { writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { config } from "./src/config.mjs";

const execFileAsync = promisify(execFile);

const ACCESS_KEY = process.env.PICOVOICE_ACCESS_KEY || "";
const WHISPER_BIN = process.env.WHISPER_BIN || "whisper-cli";
const WHISPER_MODEL = process.env.WHISPER_MODEL || join(homedir(), "ggml-base.en.bin");
const URL = process.env.JARVIS_URL || `ws://localhost:${process.env.JARVIS_PORT || 8787}`;

// VAD / capture tuning (frames are 512 samples ≈ 32ms at 16kHz).
const SILENCE_RMS = 550; // below this = silence
const SILENCE_FRAMES = 28; // ~0.9s of silence ends the utterance
const MIN_FRAMES = 10; // ignore blips
const MAX_FRAMES = 320; // ~10s hard cap

function rms(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

function pcmToWav(int16, sampleRate = 16000) {
  const dataLen = int16.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < int16.length; i++) buf.writeInt16LE(int16[i], 44 + i * 2);
  return buf;
}

async function transcribe(int16) {
  const base = join(tmpdir(), `jarvis-wake-${randomUUID()}`);
  const wav = `${base}.wav`;
  await writeFile(wav, pcmToWav(int16));
  try {
    await execFileAsync(WHISPER_BIN, ["-m", WHISPER_MODEL, "-f", wav, "-nt", "-otxt", "-of", base]);
    const txt = existsSync(`${base}.txt`) ? await readFile(`${base}.txt`, "utf8") : "";
    return txt.trim();
  } finally {
    rm(wav, { force: true }).catch(() => {});
    rm(`${base}.txt`, { force: true }).catch(() => {});
  }
}

// ---- Local, killable TTS (so we can barge in) ------------------------------

let player = null;
function stopSpeaking() {
  if (player) {
    player.kill("SIGKILL");
    player = null;
  }
}

async function synth(text) {
  const { engine, elevenLabsKey, elevenLabsVoiceId, elevenLabsModel } = config.tts;
  if (engine !== "elevenlabs" || !elevenLabsKey) return null;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`, {
    method: "POST",
    headers: { "xi-api-key": elevenLabsKey, "content-type": "application/json", accept: "audio/mpeg" },
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
  });
  if (!res.ok) return null;
  const file = join(tmpdir(), `jarvis-wake-tts-${randomUUID()}.mp3`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

async function speak(text) {
  if (!text) return;
  stopSpeaking();
  const mp3 = await synth(text).catch(() => null);
  if (mp3) {
    player = spawn("afplay", [mp3], { stdio: "ignore" });
    player.on("close", () => rm(mp3, { force: true }).catch(() => {}));
  } else {
    const args = config.tts.macVoice ? ["-v", config.tts.macVoice, text] : [text];
    player = spawn("say", args, { stdio: "ignore" });
  }
}

// ---- Main loop -------------------------------------------------------------

async function main() {
  if (!ACCESS_KEY) {
    console.error("Set PICOVOICE_ACCESS_KEY (free at https://console.picovoice.ai).");
    process.exit(1);
  }
  if (!existsSync(WHISPER_MODEL)) {
    console.error(`Whisper model not found at ${WHISPER_MODEL}. Set WHISPER_MODEL or download one.`);
    process.exit(1);
  }

  const sessionId = randomUUID();
  const ws = new WebSocket(URL);
  ws.on("error", (e) => {
    console.error(`[jarvis] cannot reach backend at ${URL} (${e.code || e.message}). Start node jarvis/server.mjs`);
    process.exit(1);
  });

  // Confirm/answer routing: when the backend asks to confirm, the next spoken
  // utterance is interpreted as the yes/no answer.
  let pendingConfirmId = null;
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "confirm") {
      pendingConfirmId = msg.id;
      speak(`Shall I run ${msg.tool}? Say yes to confirm.`);
    } else if (msg.type === "final") {
      speak(msg.reply);
    } else if (msg.type === "error") {
      console.error("[jarvis] error:", msg.message);
    }
  });
  await new Promise((r) => ws.on("open", r));

  const porcupine = new Porcupine(ACCESS_KEY, [BuiltinKeyword.JARVIS], [0.5]);
  const recorder = new PvRecorder(porcupine.frameLength, -1);
  recorder.start();
  console.error('[jarvis] wake-word ready — say "Jarvis". Ctrl-C to quit.');

  let mode = "idle"; // "idle" | "capturing"
  let capture = [];
  let silence = 0;

  const finishUtterance = async () => {
    mode = "idle";
    const frames = capture;
    capture = [];
    silence = 0;
    if (frames.length < MIN_FRAMES) return;
    const int16 = Int16Array.from(frames.flatMap((f) => Array.from(f)));
    const text = await transcribe(int16).catch(() => "");
    if (!text) return;
    console.error(`You: ${text}`);

    if (pendingConfirmId) {
      const allow = /\b(yes|yeah|confirm|go ahead|do it|please)\b/i.test(text);
      ws.send(JSON.stringify({ type: "confirm", id: pendingConfirmId, allow }));
      pendingConfirmId = null;
      return;
    }
    ws.send(JSON.stringify({ type: "chat", text, sessionId, speak: false }));
  };

  const shutdown = () => {
    try {
      recorder.stop();
      recorder.release();
      porcupine.release();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);

  // Continuous frame loop.
  for (;;) {
    const frame = await recorder.read();

    if (mode === "idle") {
      if (porcupine.process(frame) >= 0) {
        stopSpeaking(); // barge-in
        mode = "capturing";
        capture = [];
        silence = 0;
      }
      continue;
    }

    // capturing
    capture.push(frame);
    silence = rms(frame) < SILENCE_RMS ? silence + 1 : 0;
    if (silence >= SILENCE_FRAMES || capture.length >= MAX_FRAMES) {
      await finishUtterance();
    }
  }
}

main().catch((e) => {
  console.error("[jarvis] fatal:", e?.message ?? e);
  process.exit(1);
});
