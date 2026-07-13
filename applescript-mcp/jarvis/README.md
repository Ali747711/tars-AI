# Jarvis

A voice-and-text assistant that controls your Mac. Claude is the brain; the
`applescript-mcp` server (one directory up) is the hands — 46 tools across
system, Chrome, Telegram, Notes, Mail, Calendar, and more.

## Architecture

A long-running **backend** holds the MCP connection and the agent; thin
**clients** (text, voice, a future web UI) talk to it over HTTP/WebSocket.

```
clients                     backend (server.mjs)                 tools
────────                    ─────────────────────                ─────
client.mjs  ─┐              ┌── src/agent.mjs ──┐
voice.mjs   ─┼─ HTTP/WS ──▶ │   src/providers/  │ ──▶ MCP client ──▶ applescript-mcp ──▶ macOS
web UI (…)  ─┘              └── src/mcp.mjs ─────┘        (Claude)
```

```
jarvis/
  server.mjs            # HTTP + WebSocket backend (start this)
  client.mjs            # thin text client (WS)
  voice.mjs             # push-to-talk voice client (WS + local Whisper)
  brain.mjs             # standalone CLI (runs the agent in-process, no server)
  src/
    config.mjs          # all tunables + env
    mcp.mjs             # MCP client wrapper
    agent.mjs           # provider-agnostic tool-use loop
    providers/
      anthropic.mjs     # Claude provider
      index.mjs         # provider registry (add OpenAI/Ollama here)
    tts.mjs             # macOS `say`
```

**Upgrading is localized:** swap the model in `config.mjs` (or `JARVIS_MODEL`);
add an LLM vendor by writing one file in `providers/` and a line in
`providers/index.mjs`; add a capability by adding an MCP tool (no brain changes).

## Setup

```bash
# from the repo root
npm install && npm run build
export ANTHROPIC_API_KEY=sk-ant-...
export JARVIS_MODEL=claude-sonnet-4-5   # set to a model your account supports
```

For voice, also:

```bash
brew install sox whisper-cpp
curl -L -o ~/ggml-base.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```

## Run

Backend + clients (recommended):

```bash
node jarvis/server.mjs        # terminal 1 — the always-on brain
node jarvis/client.mjs        # terminal 2 — text
node jarvis/voice.mjs         # or: voice (Enter to talk, Enter to stop)
```

Or hit it directly:

```bash
curl -s localhost:8787/health
curl -s localhost:8787/tools
curl -s localhost:8787/chat -H 'content-type: application/json' \
  -d '{"text":"open youtube and find the latest claude videos","autoConfirm":true}'
```

Standalone, no server:

```bash
node jarvis/brain.mjs "what's my battery level?"
node jarvis/brain.mjs          # interactive REPL
```

## API

- `GET /health` → `{ ok, provider, model, tools, sessions }`
- `GET /tools` → `[{ name, description }]`
- `POST /chat` → body `{ text, sessionId?, autoConfirm?, speak? }` → `{ reply, steps, sessionId }`
- WebSocket: send `{type:"chat", text, sessionId?}`; receive `step`, `confirm`, `final`, `error`.
  Reply to a `confirm` with `{type:"confirm", id, allow}`.

## Safety gate

Irreversible / outbound tools are held for confirmation before running —
default: `telegram_send_message`, `telegramapi_send_message`,
`mail_create_email`, `system_quit_app` (edit `JARVIS_CONFIRM_TOOLS` or
`config.mjs`). Over REST they're denied unless `autoConfirm:true`; over
WebSocket the server asks the client interactively. The brain also treats
anything it reads from pages, messages, and emails as untrusted data.

## Config

| Env | Purpose | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Claude access (required) | — |
| `JARVIS_MODEL` | Claude model id | `claude-sonnet-4-5` |
| `JARVIS_PROVIDER` | LLM provider | `anthropic` |
| `JARVIS_PORT` | backend port | `8787` |
| `JARVIS_MAX_TOKENS` | reply cap | `1024` |
| `JARVIS_CONFIRM_TOOLS` | comma list of gated tools | see above |
| `JARVIS_SILENT` | `1` disables spoken replies | off |
| `WHISPER_BIN` / `WHISPER_MODEL` / `REC_BIN` | voice input | `whisper-cli` / `~/ggml-base.en.bin` / `sox` |

Telegram account tools need the one-time `node telegram-login.mjs` first.
