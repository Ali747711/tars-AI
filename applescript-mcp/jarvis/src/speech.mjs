// Killable speech output for the voice client, two engines behind one interface:
//
//   streaming (default with an ElevenLabs key) — tokens are forwarded into the
//     ElevenLabs stream-input WebSocket as they arrive; raw PCM audio comes
//     back within ~150-300ms and is piped straight into one persistent sox
//     `play` process. No files, no per-sentence HTTP round-trips.
//   queue (fallback) — buffers tokens into sentences, synthesizes each via the
//     ElevenLabs HTTP API (or macOS `say` without a key), plays serially.
//
// Interface: { prewarm, feed, flush, endTurn, stop, busy }
//   feed(delta)  stream in raw text as it arrives
//   flush()      force synthesis of whatever is buffered (sentence/step edge)
//   endTurn()    no more text this turn; onDrain fires once audio finishes
//   stop()       barge-in: kill playback, drop everything queued
//   prewarm()    optional: open connections early to hide latency

import WebSocket from "ws";
import { spawn } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.mjs";

const SENTENCE_SPLIT = /(?<=[.!?…])\s+|\n+/;

/** Pick the right engine from config. */
export function createSpeech({ onDrain }) {
  const { engine, elevenLabsKey, streaming } = config.tts;
  if (engine === "elevenlabs" && elevenLabsKey && streaming) {
    return createStreamingSpeech({ onDrain });
  }
  return createQueueSpeech({ onDrain });
}

// ---- Streaming engine (ElevenLabs WebSocket → sox play) ----------------------

function createStreamingSpeech({ onDrain }) {
  const { elevenLabsKey, elevenLabsVoiceId, elevenLabsModel, outputFormat } = config.tts;
  const sampleRate = Number(outputFormat.replace("pcm_", "")) || 24000;
  const wsUrl =
    `wss://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}/stream-input` +
    `?model_id=${elevenLabsModel}&output_format=${outputFormat}&auto_mode=true&inactivity_timeout=180`;

  let session = 0; // bumped by stop(); stale async callbacks bail
  let ws = null;
  let wsOpen = false;
  let player = null;
  let sendQueue = []; // text queued while the socket is still connecting
  let turnEnding = false;
  let wsFailures = 0;
  let fallback = null; // queue engine, used once the socket is deemed broken

  function useFallback() {
    if (!fallback) {
      console.error("[jarvis] streaming TTS unavailable — falling back to per-sentence synthesis.");
      fallback = createQueueSpeech({ onDrain });
    }
    return fallback;
  }

  function ensurePlayer() {
    if (player) return player;
    const mySession = session;
    player = spawn(
      "play",
      ["-q", "-t", "raw", "-r", String(sampleRate), "-e", "signed", "-b", "16", "-c", "1", "-"],
      { stdio: ["pipe", "ignore", "ignore"] },
    );
    player.on("error", () => {});
    // stdin is only ended once all audio for the turn has arrived (isFinal /
    // socket close), so player exit while a turn is ending means "audio done".
    player.on("close", () => {
      if (mySession !== session) return;
      player = null;
      if (turnEnding) {
        turnEnding = false;
        onDrain?.();
      }
    });
    return player;
  }

  function wsSend(payload) {
    if (wsOpen) {
      ws.send(JSON.stringify(payload));
    } else {
      sendQueue.push(payload);
      ensureWs();
    }
  }

  function ensureWs() {
    if (ws) return;
    if (wsFailures >= 2) return; // socket keeps failing — stay on fallback
    const mySession = session;
    const sock = new WebSocket(wsUrl, { headers: { "xi-api-key": elevenLabsKey } });
    ws = sock;

    sock.on("open", () => {
      if (mySession !== session) return sock.terminate();
      wsFailures = 0;
      wsOpen = true;
      sock.send(
        JSON.stringify({
          text: " ",
          voice_settings: {
            stability: config.tts.stability,
            similarity_boost: config.tts.similarity,
            style: config.tts.style,
            use_speaker_boost: true,
          },
        }),
      );
      const queued = sendQueue;
      sendQueue = [];
      for (const payload of queued) sock.send(JSON.stringify(payload));
    });

    sock.on("message", (raw) => {
      if (mySession !== session) return;
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.audio) ensurePlayer().stdin.write(Buffer.from(msg.audio, "base64"));
      if (msg.isFinal) player?.stdin.end();
    });

    sock.on("error", (e) => {
      if (mySession !== session) return;
      wsFailures++;
      console.error(`[jarvis] TTS socket error: ${e?.message ?? e}`);
    });

    sock.on("close", () => {
      if (mySession !== session) return;
      ws = null;
      wsOpen = false;
      // Socket died before we could speak queued text — replay it on the fallback.
      const orphaned = sendQueue;
      sendQueue = [];
      const orphanText = orphaned.map((p) => p.text ?? "").join("");
      if (orphanText.trim()) {
        const fb = useFallback();
        fb.feed(orphanText);
        fb.flush();
        if (turnEnding) {
          turnEnding = false;
          fb.endTurn();
        }
        return;
      }
      if (player) {
        player.stdin.end(); // let buffered audio finish; drain fires on close
      } else if (turnEnding) {
        turnEnding = false;
        onDrain?.();
      }
    });
  }

  return {
    prewarm() {
      if (fallback) return;
      ensureWs();
    },
    feed(delta) {
      const text = String(delta ?? "");
      if (!text) return;
      if (fallback) return fallback.feed(text);
      wsSend({ text });
    },
    flush() {
      if (fallback) return fallback.flush();
      if (ws || sendQueue.length) wsSend({ text: " ", flush: true });
    },
    endTurn() {
      if (fallback) return fallback.endTurn();
      if (ws || sendQueue.length) {
        turnEnding = true;
        wsSend({ text: "" }); // EOS: server flushes remaining audio, then closes
      } else if (player) {
        turnEnding = true;
        player.stdin.end();
      } else {
        onDrain?.();
      }
    },
    stop() {
      session++;
      turnEnding = false;
      sendQueue = [];
      if (ws) {
        ws.terminate();
        ws = null;
        wsOpen = false;
      }
      if (player) {
        player.kill("SIGKILL");
        player = null;
      }
      fallback?.stop();
    },
    busy() {
      return player !== null || turnEnding || (fallback?.busy() ?? false);
    },
  };
}

// ---- Queue engine (per-sentence ElevenLabs HTTP, or macOS `say`) -------------

async function synthToFile(text) {
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
  const file = join(tmpdir(), `jarvis-tts-${randomUUID()}.mp3`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

function createQueueSpeech({ onDrain }) {
  const queue = []; // [{ text, cancelled, mp3: Promise<string|null> }]
  let playing = false;
  let player = null;
  let sentenceBuf = "";
  let turnEnding = false;

  const playProc = (cmd, args) =>
    new Promise((resolve) => {
      player = spawn(cmd, args, { stdio: "ignore" });
      player.on("close", resolve);
      player.on("error", resolve);
    });

  async function pump() {
    if (playing) return;
    playing = true;
    while (queue.length) {
      const item = queue.shift();
      const mp3 = await item.mp3.catch(() => null);
      if (item.cancelled) {
        if (mp3) rm(mp3, { force: true }).catch(() => {});
        continue;
      }
      if (mp3) {
        await playProc("afplay", [mp3]);
        rm(mp3, { force: true }).catch(() => {});
      } else {
        const args = config.tts.macVoice ? ["-v", config.tts.macVoice, item.text] : [item.text];
        await playProc("say", args);
      }
      player = null;
    }
    playing = false;
    turnEnding = false;
    onDrain?.();
  }

  function enqueue(text) {
    const t = String(text ?? "").trim();
    if (t.length < 2) return;
    queue.push({ text: t, cancelled: false, mp3: synthToFile(t) });
    void pump();
  }

  function flush() {
    const s = sentenceBuf.trim();
    sentenceBuf = "";
    if (s) enqueue(s);
  }

  return {
    prewarm() {},
    feed(delta) {
      sentenceBuf += String(delta ?? "");
      const parts = sentenceBuf.split(SENTENCE_SPLIT);
      sentenceBuf = parts.pop() ?? "";
      for (const s of parts) enqueue(s);
    },
    flush,
    endTurn() {
      flush();
      turnEnding = true;
      if (!playing && queue.length === 0) {
        turnEnding = false;
        onDrain?.();
      }
    },
    stop() {
      sentenceBuf = "";
      turnEnding = false;
      for (const item of queue) item.cancelled = true;
      queue.length = 0;
      if (player) {
        player.kill("SIGKILL");
        player = null;
      }
    },
    busy() {
      return playing || queue.length > 0;
    },
  };
}
