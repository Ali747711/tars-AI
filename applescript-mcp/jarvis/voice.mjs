// Jarvis voice client: push-to-talk mic + local Whisper, talking to the backend
// (server.mjs) over WebSocket. Run the server first.
//
// Prerequisites (macOS):
//   brew install sox whisper-cpp
//   curl -L -o ~/ggml-base.en.bin \
//     https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
//
// Env: WHISPER_BIN (default whisper-cli), WHISPER_MODEL (default ~/ggml-base.en.bin),
//      REC_BIN (default sox), JARVIS_URL / JARVIS_PORT.
//
// Usage:
//   node jarvis/server.mjs     # terminal 1
//   node jarvis/voice.mjs      # terminal 2 — Enter to talk, Enter to stop

import WebSocket from "ws";
import { spawn, execFile } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const WHISPER_BIN = process.env.WHISPER_BIN || "whisper-cli";
const WHISPER_MODEL = process.env.WHISPER_MODEL || join(homedir(), "ggml-base.en.bin");
const REC_BIN = process.env.REC_BIN || "sox";
const PORT = Number(process.env.JARVIS_PORT || 8787);
const URL = process.env.JARVIS_URL || `ws://localhost:${PORT}`;

/** Record from the default mic to a 16kHz mono WAV until stop() is called. */
function startRecording(wavPath) {
  const proc = spawn(REC_BIN, ["-d", "-q", "-r", "16000", "-c", "1", "-b", "16", wavPath], {
    stdio: "ignore",
  });
  let failed = null;
  proc.on("error", (e) => {
    failed = e;
  });
  return {
    stop: () =>
      new Promise((resolve) => {
        if (failed) return resolve(failed);
        proc.once("close", () => resolve(null));
        proc.kill("SIGINT");
      }),
  };
}

/** Transcribe a WAV with whisper.cpp and return recognized text. */
async function transcribe(wavPath) {
  const outBase = wavPath.replace(/\.wav$/, "");
  await execFileAsync(WHISPER_BIN, ["-m", WHISPER_MODEL, "-f", wavPath, "-nt", "-otxt", "-of", outBase]);
  const txtPath = `${outBase}.txt`;
  const text = existsSync(txtPath) ? readFileSync(txtPath, "utf8").trim() : "";
  rmSync(txtPath, { force: true });
  return text;
}

function preflight() {
  if (!existsSync(WHISPER_MODEL)) {
    console.error(
      `Whisper model not found at ${WHISPER_MODEL}. Download one or set WHISPER_MODEL:\n` +
        "  curl -L -o ~/ggml-base.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
    );
    process.exit(1);
  }
}

async function main() {
  preflight();
  const rl = readline.createInterface({ input, output });
  const sessionId = randomUUID();
  const ws = new WebSocket(URL);
  let awaitingReply = null;

  ws.on("error", (e) => {
    console.error(
      `[jarvis] cannot reach the backend at ${URL} (${e.code || e.message}).\n` +
        "         Start it first in another terminal:  node jarvis/server.mjs",
    );
    process.exit(1);
  });

  ws.on("message", async (raw) => {
    const msg = JSON.parse(raw.toString());
    switch (msg.type) {
      case "step":
        console.error(`  › ${msg.tool} ${JSON.stringify(msg.args)}`);
        break;
      case "confirm": {
        const prompt = `About to run ${msg.tool}. Say or type yes to allow.`;
        const answer = (await rl.question(`\n⚠️  ${prompt} ${JSON.stringify(msg.args)} [y/N] `)).trim();
        ws.send(JSON.stringify({ type: "confirm", id: msg.id, allow: /^y(es)?$/i.test(answer) }));
        break;
      }
      case "final":
        console.log(`Jarvis: ${msg.reply}`);
        awaitingReply?.();
        break;
      case "error":
        console.error(`[jarvis] error: ${msg.message}`);
        awaitingReply?.();
        break;
    }
  });

  ws.on("close", () => {
    console.error("[jarvis] disconnected.");
    process.exit(0);
  });

  await new Promise((r) => ws.on("open", r));
  console.error(`[jarvis] voice ready (${URL}). Enter=talk, "exit"=quit.`);

  while (true) {
    const cmd = (await rl.question('\n[Enter to talk, or "exit"] ')).trim();
    if (/^(exit|quit)$/i.test(cmd)) break;

    const wav = join(tmpdir(), `jarvis-${Date.now()}.wav`);
    const rec = startRecording(wav);
    await rl.question("🎙  Recording… press Enter to stop ");
    const recErr = await rec.stop();
    if (recErr) {
      console.error(`[jarvis] recorder failed (${REC_BIN}): ${recErr.message}. Is sox installed?`);
      rmSync(wav, { force: true });
      continue;
    }

    let text = "";
    try {
      text = await transcribe(wav);
    } catch (e) {
      console.error(`[jarvis] transcription failed: ${e?.message ?? e}`);
    } finally {
      rmSync(wav, { force: true });
    }
    if (!text) {
      console.error("[jarvis] heard nothing — try again.");
      continue;
    }

    console.log(`You said: ${text}`);
    await new Promise((resolve) => {
      awaitingReply = resolve;
      ws.send(JSON.stringify({ type: "chat", text, sessionId }));
    });
  }

  rl.close();
  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("[jarvis] fatal:", e?.message ?? e);
  process.exit(1);
});
