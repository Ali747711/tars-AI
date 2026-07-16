# openWakeWord sidecar for voice-wake.mjs.
#
# Reads raw 16kHz mono int16 PCM on stdin (streamed by PvRecorder in Node),
# runs the pretrained "hey jarvis" model, and prints one line per detection:
#
#   DETECT <score>
#
# Debounced: after a detection the score must fall back below RESET before it
# can fire again, so one utterance never emits twice.
#
# Run via the project venv:  wakeword/.venv/bin/python wakeword/listen.py

import os
import sys
import time

import numpy as np
from openwakeword.model import Model

CHUNK = 1280  # samples (80ms @ 16kHz) — openWakeWord's native frame size
THRESHOLD = float(sys.argv[1]) if len(sys.argv) > 1 else 0.5
RESET = 0.2
# JARVIS_WAKE_DEBUG=1 → print the per-second peak score and mic level to
# stderr, so you can see whether the mic hears you and how close you are
# to the detection threshold.
DEBUG = os.environ.get("JARVIS_WAKE_DEBUG") == "1"

model = Model(wakeword_models=["hey_jarvis_v0.1"], inference_framework="onnx")
print("READY", flush=True)

armed = True
buf = b""
stdin = sys.stdin.buffer
dbg_t = time.time()
dbg_score = 0.0
dbg_level = 0

while True:
    data = stdin.read(CHUNK * 2 - len(buf))
    if not data:
        break  # parent closed the pipe
    buf += data
    if len(buf) < CHUNK * 2:
        continue
    frame = np.frombuffer(buf, dtype=np.int16)
    buf = b""
    score = model.predict(frame)["hey_jarvis_v0.1"]
    if armed and score >= THRESHOLD:
        armed = False
        print(f"DETECT {score:.2f}", flush=True)
    elif not armed and score < RESET:
        armed = True
    if DEBUG:
        dbg_score = max(dbg_score, score)
        dbg_level = max(dbg_level, int(np.abs(frame).max()))
        if time.time() - dbg_t >= 1.0:
            print(f"[wake] score {dbg_score:.2f}  mic-peak {dbg_level}", file=sys.stderr, flush=True)
            dbg_t, dbg_score, dbg_level = time.time(), 0.0, 0
