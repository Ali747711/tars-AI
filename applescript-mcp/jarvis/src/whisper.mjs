// Local speech-to-text via whisper.cpp.
//
// Preferred path: a persistent `whisper-server` child process started once at
// boot — the model stays loaded in RAM, so each transcription is a quick HTTP
// call (~0.2-0.4s) instead of a 1-3s process spawn + model load.
// Fallback path: one-shot `whisper-cli`, used when the server can't start.

import { spawn, execFile } from "node:child_process";
import { writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config.mjs";

const execFileAsync = promisify(execFile);

const SERVER_URL = `http://127.0.0.1:${config.whisper.port}`;
const READY_TIMEOUT_MS = 20_000; // model load can take a few seconds
const READY_POLL_MS = 250;

let serverProc = null;
let serverReady = false;
let warnedFallback = false;

/** Strip whisper noise annotations like [BLANK_AUDIO] or (wind blowing). */
function cleanTranscript(text) {
  return String(text ?? "")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, "")
    .trim();
}

/** Build a 16-bit mono WAV buffer from raw PCM samples. */
export function pcmToWav(int16, sampleRate = 16000) {
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

/** True if something is already answering on the whisper-server port. */
async function serverReachable() {
  try {
    await fetch(SERVER_URL, { signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a whisper-server is available: reuse one already listening on the
 * port, otherwise spawn our own and wait for it to load the model. Returns
 * true when the fast path is up; on failure logs and leaves the CLI fallback.
 */
export async function startWhisperServer() {
  if (serverReady) return true;
  if (await serverReachable()) {
    serverReady = true;
    return true;
  }

  try {
    serverProc = spawn(
      config.whisper.serverBin,
      ["-m", config.whisper.model, "--host", "127.0.0.1", "--port", String(config.whisper.port)],
      { stdio: "ignore" },
    );
  } catch (e) {
    console.error(`[jarvis] whisper-server failed to spawn (${e?.message ?? e}); using whisper-cli.`);
    return false;
  }
  serverProc.on("error", () => {
    serverProc = null;
  });
  serverProc.on("exit", () => {
    serverProc = null;
    serverReady = false;
  });

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!serverProc) break; // died during startup (bad model path, port clash…)
    if (await serverReachable()) {
      serverReady = true;
      return true;
    }
    await new Promise((r) => setTimeout(r, READY_POLL_MS));
  }
  console.error("[jarvis] whisper-server did not come up; falling back to whisper-cli per turn.");
  stopWhisperServer();
  return false;
}

export function stopWhisperServer() {
  serverReady = false;
  if (serverProc) {
    try {
      serverProc.kill();
    } catch {
      /* ignore */
    }
    serverProc = null;
  }
}

/** Fast path: POST the WAV to the persistent server, no temp files. */
async function transcribeViaServer(wav) {
  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "audio.wav");
  form.append("response_format", "json");
  const res = await fetch(`${SERVER_URL}/inference`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`whisper-server HTTP ${res.status}`);
  const { text } = await res.json();
  return cleanTranscript(text);
}

/** Fallback path: one-shot whisper-cli with temp files (cold start each call). */
async function transcribeViaCli(wav) {
  const base = join(tmpdir(), `jarvis-stt-${randomUUID()}`);
  const wavPath = `${base}.wav`;
  await writeFile(wavPath, wav);
  try {
    await execFileAsync(config.whisper.bin, [
      "-m", config.whisper.model, "-f", wavPath, "-nt", "-otxt", "-of", base,
    ]);
    const txt = existsSync(`${base}.txt`) ? await readFile(`${base}.txt`, "utf8") : "";
    return cleanTranscript(txt);
  } finally {
    rm(wavPath, { force: true }).catch(() => {});
    rm(`${base}.txt`, { force: true }).catch(() => {});
  }
}

/** Transcribe raw 16kHz mono PCM samples to text. */
export async function transcribe(int16) {
  const wav = pcmToWav(int16);
  if (serverReady) {
    try {
      return await transcribeViaServer(wav);
    } catch (e) {
      if (!warnedFallback) {
        console.error(`[jarvis] whisper-server request failed (${e?.message ?? e}); using whisper-cli.`);
        warnedFallback = true;
      }
    }
  }
  return transcribeViaCli(wav);
}
