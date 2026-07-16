// Jarvis conversational voice client: always-listening "Hey Jarvis" wake word
// with a ChatGPT-voice-style conversation loop.
//
//   say "Hey Jarvis" → instant acknowledgment chime, mic opens
//   speak         → energy-VAD detects when you finish
//   Jarvis replies sentence-by-sentence while the model is still writing
//   keep talking  → after a reply, the mic stays hot for a follow-up window
//                   (JARVIS_FOLLOWUP_MS, default 7s) — no wake word needed
//   interrupt     → say "Jarvis" at any time (thinking or speaking) to barge in
//
// Pipeline: PvRecorder mic frames → wake word → energy-VAD capture →
// persistent whisper-server transcription (model stays in RAM, ~0.3s/turn) →
// backend WS (speak:false, token streaming) → streaming TTS (tokens feed the
// ElevenLabs WebSocket; PCM audio pipes straight to the speaker as it arrives).
// Fallbacks: whisper-cli when the server can't start; per-sentence HTTP
// synthesis or macOS `say` when streaming TTS is unavailable.
//
// Wake-word engines (auto-selected):
//   openwakeword (default) — free, offline, no account. One-time setup:
//     python3 -m venv jarvis/wakeword/.venv
//     jarvis/wakeword/.venv/bin/pip install openwakeword onnxruntime
//     jarvis/wakeword/.venv/bin/python -c "from openwakeword.utils import download_models; download_models(model_names=['hey_jarvis_v0.1'])"
//   porcupine — used automatically when PICOVOICE_ACCESS_KEY is set
//     (key from https://console.picovoice.ai; wake phrase is just "Jarvis").
//
// Other prerequisites (macOS):
//   brew install whisper-cpp
//   curl -L -o ~/ggml-base.en.bin \
//     https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
//
// Env: JARVIS_WAKE_ENGINE (openwakeword|porcupine), JARVIS_WAKE_THRESHOLD,
//      PICOVOICE_ACCESS_KEY, WHISPER_BIN, WHISPER_MODEL, JARVIS_WHISPER_PORT,
//      JARVIS_SILENCE_MS, JARVIS_URL / JARVIS_PORT, JARVIS_FOLLOWUP_MS,
//      JARVIS_WAKE_SOUND, JARVIS_ONSET_RMS, JARVIS_TTS_STREAMING.
//      TTS reuses your ELEVENLABS_* / JARVIS_VOICE.
//
// Run the backend first, then: node jarvis/voice-wake.mjs

import { Porcupine, BuiltinKeyword } from "@picovoice/porcupine-node";
import { PvRecorder } from "@picovoice/pvrecorder-node";
import WebSocket from "ws";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./src/config.mjs";
import { transcribe, startWhisperServer, stopWhisperServer } from "./src/whisper.mjs";
import { createSpeech } from "./src/speech.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const ACCESS_KEY = process.env.PICOVOICE_ACCESS_KEY || "";
const WAKE_ENGINE = process.env.JARVIS_WAKE_ENGINE || (ACCESS_KEY ? "porcupine" : "openwakeword");
const WAKE_THRESHOLD = process.env.JARVIS_WAKE_THRESHOLD || "0.5";

// Which microphone to use, as a case-insensitive substring of the device name
// (e.g. JARVIS_MIC=macbook). Empty = system default — beware: if AirPods are
// connected, *they* are usually the default input.
const MIC = (process.env.JARVIS_MIC || "").toLowerCase();

function pickMicDevice() {
  if (!MIC) return -1;
  const devices = PvRecorder.getAvailableDevices();
  const idx = devices.findIndex((d) => d.toLowerCase().includes(MIC));
  if (idx === -1) {
    console.error(
      `[jarvis] no microphone matching "${process.env.JARVIS_MIC}" — using system default.\n` +
        `         Available: ${devices.join(" | ")}`,
    );
    return -1;
  }
  return idx;
}
const URL = process.env.JARVIS_URL || `ws://localhost:${process.env.JARVIS_PORT || 8787}`;

// VAD / capture tuning (frames are 512 samples ≈ 32ms at 16kHz).
const SILENCE_RMS = 550; // below this = silence
const SILENCE_FRAMES = Math.max(6, Math.round(config.silenceMs / 32)); // trailing silence that ends the utterance
const MIN_FRAMES = 10; // ignore blips
const MAX_FRAMES = 320; // ~10s hard cap

// Conversational follow-up window: after Jarvis finishes speaking, the mic
// stays hot for this long so you can reply without saying "Jarvis" again.
const FOLLOWUP_MS = Number(process.env.JARVIS_FOLLOWUP_MS || 7000);
const FOLLOWUP_ARM_DELAY_MS = 350; // let speaker-tail echo die down first
const ONSET_RMS = Number(process.env.JARVIS_ONSET_RMS || 700); // speech-start threshold
const ONSET_FRAMES = 3; // ~0.1s above threshold = speech started

// Short acknowledgment sound played the instant the wake word is heard.
const WAKE_SOUND = process.env.JARVIS_WAKE_SOUND || "/System/Library/Sounds/Pop.aiff";

function rms(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

/** Fire-and-forget short sound effect (wake acknowledgment). */
function playSound(file) {
  if (!file || !existsSync(file)) return;
  try {
    spawn("afplay", [file], { stdio: "ignore" }).on("error", () => {});
  } catch {
    /* best-effort */
  }
}

// ---- Wake-word engines --------------------------------------------------------
//
// Both expose { frameLength, phrase, feed(frame), close() } and call onWake()
// when the wake phrase is heard. feed() gets every mic frame except during
// utterance capture.

/** Picovoice Porcupine — requires PICOVOICE_ACCESS_KEY; wake phrase "Jarvis". */
function createPorcupineEngine(onWake) {
  let porcupine;
  try {
    porcupine = new Porcupine(ACCESS_KEY, [BuiltinKeyword.JARVIS], [0.5]);
  } catch (e) {
    console.error(
      "[jarvis] Porcupine rejected PICOVOICE_ACCESS_KEY — it must be the AccessKey string\n" +
        "         from https://console.picovoice.ai. To use the free offline engine instead,\n" +
        "         remove PICOVOICE_ACCESS_KEY from .env.\n" +
        `         Underlying error: ${e?.message ?? e}`,
    );
    process.exit(1);
  }
  return {
    frameLength: porcupine.frameLength,
    phrase: '"Jarvis"',
    feed(frame) {
      if (porcupine.process(frame) >= 0) onWake();
    },
    close() {
      try {
        porcupine.release();
      } catch {
        /* ignore */
      }
    },
  };
}

/** openWakeWord sidecar — free/offline, wake phrase "Hey Jarvis". */
function createOpenWakeWordEngine(onWake) {
  const py = join(HERE, "wakeword", ".venv", "bin", "python");
  const script = join(HERE, "wakeword", "listen.py");
  if (!existsSync(py) || !existsSync(script)) {
    console.error(
      "[jarvis] openWakeWord is not set up yet. One-time setup (from applescript-mcp/):\n" +
        "  python3 -m venv jarvis/wakeword/.venv\n" +
        "  jarvis/wakeword/.venv/bin/pip install openwakeword onnxruntime\n" +
        "  jarvis/wakeword/.venv/bin/python -c \"from openwakeword.utils import download_models; download_models(model_names=['hey_jarvis_v0.1'])\"",
    );
    process.exit(1);
  }
  const proc = spawn(py, [script, WAKE_THRESHOLD], { stdio: ["pipe", "pipe", "inherit"] });
  proc.stdout.setEncoding("utf8");
  let lineBuf = "";
  proc.stdout.on("data", (chunk) => {
    lineBuf += chunk;
    const lines = lineBuf.split("\n");
    lineBuf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("DETECT")) onWake();
    }
  });
  proc.on("exit", (code) => {
    console.error(`[jarvis] wake-word sidecar exited unexpectedly (code ${code}).`);
    process.exit(1);
  });
  return {
    frameLength: 512, // python side re-buffers to openWakeWord's 1280-sample chunks
    phrase: '"Hey Jarvis"',
    feed(frame) {
      proc.stdin.write(Buffer.from(frame.buffer, frame.byteOffset, frame.length * 2));
    },
    close() {
      proc.removeAllListeners("exit");
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    },
  };
}

// ---- Main loop ---------------------------------------------------------------

async function main() {
  if (!existsSync(config.whisper.model)) {
    console.error(`Whisper model not found at ${config.whisper.model}. Set WHISPER_MODEL or download one.`);
    process.exit(1);
  }

  // Keep the whisper model loaded in RAM so per-turn transcription is fast.
  const whisperFast = await startWhisperServer();
  console.error(`[jarvis] transcription: ${whisperFast ? `whisper-server :${config.whisper.port}` : "whisper-cli (slow path)"}`);

  // Stable session so conversation history survives restarts. Point
  // JARVIS_SESSION at a fresh name any time you want a clean slate.
  const sessionId = process.env.JARVIS_SESSION || "voice";
  const ws = new WebSocket(URL);
  ws.on("error", (e) => {
    console.error(`[jarvis] cannot reach backend at ${URL} (${e.code || e.message}). Start node jarvis/server.mjs`);
    process.exit(1);
  });

  // Conversation state machine:
  //   idle      wake-word detection only
  //   capture   recording an utterance (VAD decides when you're done)
  //   busy      turn in flight and/or Jarvis speaking (wake word = barge-in)
  //   followup  mic hot for a reply without the wake word
  let state = "idle";
  let gen = 0; // bumped on barge-in; stale async work checks it and bails
  let turnGen = -1; // gen the in-flight chat turn belongs to
  let turnDone = false;
  let spokeAny = false;
  let pendingConfirmId = null;

  let capture = [];
  let silence = 0;
  let onset = 0;
  let preroll = [];
  let followupArmed = false;
  let armTimer = null;
  let followupTimer = null;

  const speech = createSpeech({ onDrain: maybeFollowup });

  function clearFollowupTimers() {
    clearTimeout(armTimer);
    clearTimeout(followupTimer);
    followupArmed = false;
  }

  /** Open the follow-up window: mic hot, no wake word needed. */
  function enterFollowup() {
    state = "followup";
    onset = 0;
    preroll = [];
    clearFollowupTimers();
    armTimer = setTimeout(() => {
      followupArmed = true;
    }, FOLLOWUP_ARM_DELAY_MS);
    followupTimer = setTimeout(() => {
      if (state === "followup") {
        state = "idle";
        console.error('[jarvis] (idle — say "Jarvis")');
      }
    }, FOLLOWUP_MS);
    console.error("[jarvis] listening for a follow-up…");
  }

  /** After speech drains: follow-up window if the turn ended or a confirm is pending. */
  function maybeFollowup() {
    if (state !== "busy") return;
    if (speech.busy()) return;
    if (turnDone || pendingConfirmId) enterFollowup();
  }

  function beginCapture(prerollFrames = []) {
    clearFollowupTimers();
    state = "capture";
    capture = [...prerollFrames];
    silence = 0;
    onset = 0;
    preroll = [];
  }

  /** Wake word heard: stop everything, acknowledge, listen. */
  function bargeIn() {
    gen++;
    turnDone = false;
    speech.stop();
    playSound(WAKE_SOUND);
    console.error("\n[jarvis] yes?");
    beginCapture();
  }

  async function finishUtterance(frames) {
    if (frames.length < MIN_FRAMES) {
      enterFollowup();
      return;
    }
    const myGen = gen;
    const int16 = Int16Array.from(frames.flatMap((f) => Array.from(f)));
    const text = await transcribe(int16).catch(() => "");
    if (gen !== myGen || state !== "busy") return; // barged in meanwhile
    if (!text) {
      enterFollowup(); // heard nothing intelligible — give another chance
      return;
    }
    console.error(`You: ${text}`);

    if (pendingConfirmId) {
      const allow = /\b(yes|yeah|yep|sure|confirm|go ahead|do it|please)\b/i.test(text);
      ws.send(JSON.stringify({ type: "confirm", id: pendingConfirmId, allow }));
      pendingConfirmId = null;
      return; // stay busy — the original turn resumes streaming
    }

    turnGen = myGen;
    turnDone = false;
    spokeAny = false;
    speech.prewarm(); // open the TTS socket while Claude thinks
    ws.send(JSON.stringify({ type: "chat", text, sessionId, speak: false }));
  }

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "token":
        if (turnGen !== gen) return; // stale turn (barged in)
        process.stdout.write(msg.text);
        spokeAny = true;
        speech.feed(msg.text); // straight into the TTS stream
        break;
      case "step":
        if (turnGen !== gen) return;
        speech.flush(); // speak the pre-tool sentence while the tool runs
        console.error(`\n  › ${msg.tool} ${JSON.stringify(msg.args ?? {})}`);
        break;
      case "confirm":
        if (turnGen !== gen) {
          // A stale turn asking for permission after a barge-in: deny it.
          ws.send(JSON.stringify({ type: "confirm", id: msg.id, allow: false }));
          return;
        }
        pendingConfirmId = msg.id;
        speech.feed(` Shall I run ${String(msg.tool).replace(/_/g, " ")}? Say yes to confirm.`);
        // End the audio turn so onDrain opens the follow-up window for the answer.
        speech.endTurn();
        break;
      case "final":
        if (turnGen !== gen) return;
        process.stdout.write("\n");
        if (!spokeAny && msg.reply) speech.feed(msg.reply); // non-streaming provider fallback
        turnDone = true;
        speech.endTurn(); // onDrain → follow-up window once audio finishes
        break;
      case "error":
        console.error(`\n[jarvis] error: ${msg.message}`);
        if (turnGen === gen) {
          turnDone = true;
          speech.endTurn();
        }
        break;
    }
  });

  await new Promise((r) => ws.on("open", r));
  ws.on("close", () => {
    console.error("[jarvis] disconnected.");
    process.exit(0);
  });

  // Wake detection can arrive asynchronously (openWakeWord sidecar), so wake
  // events set a flag the frame loop consumes on its next iteration.
  let wakePending = false;
  const engine =
    WAKE_ENGINE === "porcupine"
      ? createPorcupineEngine(() => {
          wakePending = true;
        })
      : createOpenWakeWordEngine(() => {
          wakePending = true;
        });

  const recorder = new PvRecorder(engine.frameLength, pickMicDevice());
  recorder.start();
  console.error(
    `[jarvis] conversational voice ready (${WAKE_ENGINE}, mic: ${recorder.getSelectedDevice()}) — ` +
      `say ${engine.phrase} to start, keep talking for follow-ups, ` +
      `say ${engine.phrase} to interrupt. Ctrl-C to quit.`,
  );

  const shutdown = () => {
    speech.stop();
    stopWhisperServer();
    engine.close();
    try {
      recorder.stop();
      recorder.release();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);

  // Continuous frame loop. Never blocks on transcription or the agent — those
  // run async so the wake word keeps working while Jarvis thinks and speaks.
  for (;;) {
    const frame = await recorder.read();

    if (state !== "capture") engine.feed(frame);
    if (wakePending) {
      wakePending = false;
      if (state !== "capture") {
        bargeIn();
        continue;
      }
    }

    if (state === "capture") {
      capture.push(frame);
      silence = rms(frame) < SILENCE_RMS ? silence + 1 : 0;
      if (silence >= SILENCE_FRAMES || capture.length >= MAX_FRAMES) {
        const frames = capture;
        capture = [];
        state = "busy";
        void finishUtterance(frames);
      }
    } else if (state === "followup" && followupArmed) {
      // Speech onset detection: a burst of energy opens the mic, and the
      // frames that triggered it are kept so the first word isn't clipped.
      if (rms(frame) >= ONSET_RMS) {
        preroll.push(frame);
        onset++;
        if (onset >= ONSET_FRAMES) beginCapture(preroll);
      } else {
        onset = 0;
        preroll = [];
      }
    }
  }
}

main().catch((e) => {
  console.error("[jarvis] fatal:", e?.message ?? e);
  process.exit(1);
});
