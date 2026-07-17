# Jarvis LiveKit voice agent

Seamless-conversation voice agent (Option A: this worker owns the brain), reusing
the rest of Jarvis:

- **STT** — the same local whisper.cpp server the Node voice client uses (free, offline)
- **LLM** — Claude via `ANTHROPIC_API_KEY` (shared `applescript-mcp/.env`)
- **TTS** — ElevenLabs `eleven_flash_v2_5`, same Daniel voice
- **Tools** — all `applescript-mcp` Mac tools over MCP, plus memory / activity /
  routine tools bridged to the Node backend's REST API, so voice and web UI share
  one memory

Outbound/irreversible tools (`telegram_send_message`, `mail_create_email`, …) are
excluded in voice mode by default — there is no hard confirmation gate over voice.
Override with `JARVIS_VOICE_BLOCKED_TOOLS`.

## Setup

```bash
cd livekit-agent
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Uses `applescript-mcp/.env` automatically (a local `livekit-agent/.env` overrides it).

## Run

No LiveKit account needed — local mic/speaker:

```bash
.venv/bin/python agent.py console
```

Against LiveKit Cloud (talk to Jarvis from your phone/browser anywhere; the worker
must run on this Mac since the tools control it):

```bash
# add to applescript-mcp/.env (from cloud.livekit.io project settings):
#   LIVEKIT_URL=wss://<project>.livekit.cloud
#   LIVEKIT_API_KEY=...
#   LIVEKIT_API_SECRET=...
.venv/bin/python agent.py dev
```

Then connect from any LiveKit client (e.g. the Agents Playground at
https://agents-playground.livekit.io) using the same project.

Run `node jarvis/server.mjs` (the backend) alongside so memory/routines work.

## Tests

Behavioral tests run the real Claude model against the agent's instructions and
tools — no LiveKit credentials needed:

```bash
.venv/bin/pytest -q
```
