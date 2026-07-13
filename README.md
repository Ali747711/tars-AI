# Jarvis — Personal Mac Assistant

A voice-and-text AI assistant that controls your Mac. Claude is the brain, an
AppleScript-powered [MCP](https://modelcontextprotocol.io) server is the hands,
and a React HUD-style web UI is the face.

Say (or type) *"open YouTube and find the latest Claude videos"*, *"what's my
battery level?"*, or *"send Ali a Telegram message that I'm running late"* —
Jarvis plans the steps, calls the right macOS tools, and reports back, with a
confirmation gate before anything irreversible happens.

## Repository Layout

```
jarvis/
├── applescript-mcp/        # MCP server + Jarvis backend
│   ├── src/                #   MCP server: 46 tools across 18 macOS categories
│   │   ├── categories/     #   calendar, chrome, clipboard, contacts, files,
│   │   │                   #   finder, iterm, mail, messages, music, notes,
│   │   │                   #   notifications, pages, screen, shortcuts,
│   │   │                   #   system, telegram, telegramApi
│   │   ├── framework.ts    #   AppleScript execution framework
│   │   └── index.ts        #   MCP server entry point
│   └── jarvis/             #   The assistant itself
│       ├── server.mjs      #   HTTP + WebSocket backend (the always-on brain)
│       ├── client.mjs      #   thin terminal text client
│       ├── voice.mjs       #   push-to-talk voice client (local Whisper)
│       ├── voice-wake.mjs  #   always-listening "Jarvis" wake word (Picovoice)
│       ├── brain.mjs       #   standalone CLI / REPL, no server needed
│       └── src/            #   agent loop, MCP client, providers, TTS, memory,
│                           #   scheduler, config
└── client/                 # Web UI — React 19 + Vite + Tailwind v4
    └── src/                #   Iron-Man-style HUD: chat, live tool steps,
                            #   confirmations, voice input, tool palette
```

## Architecture

A long-running **backend** holds the MCP connection and the agent loop; thin
**clients** (terminal, voice, web UI) talk to it over HTTP/WebSocket.

```
clients                      backend (server.mjs)                  tools
────────                     ─────────────────────                 ─────
client.mjs   ─┐              ┌── src/agent.mjs ──┐
voice.mjs    ─┼─ HTTP/WS ──▶ │   src/providers/  │ ──▶ MCP client ──▶ applescript-mcp ──▶ macOS
web UI       ─┘              └── src/mcp.mjs ────┘        (Claude)
```

Key design points:

- **Provider-agnostic agent loop** — Claude today; add OpenAI/Ollama by writing
  one file in `jarvis/src/providers/` and registering it in
  `providers/index.mjs`.
- **Capabilities live in the MCP server** — adding a tool requires zero brain
  changes.
- **Streaming over WebSocket** — clients receive `step` events as tools run,
  `confirm` requests for gated tools, then the `final` reply.

## Features

### macOS control (46 MCP tools)

| Category | Examples |
| --- | --- |
| System | volume, dark mode, battery, launch/quit apps |
| Chrome | open URLs, search, read/control tabs |
| Calendar & Reminders | create events, list today's schedule |
| Mail & Messages | compose email, list/search/send messages |
| Telegram | send/read messages (bot API + user account via MTProto) |
| Notes & Pages | create formatted notes, documents |
| Files & Finder | search, move, reveal files |
| Music | playback control |
| Clipboard | get/set/clear |
| Shortcuts | run any macOS Shortcut |
| Screen, iTerm, Contacts, Notifications | screenshots, terminal commands, lookups, alerts |

### Voice

- **Push-to-talk** (`voice.mjs`) — record with SoX, transcribe locally with
  whisper.cpp (no audio leaves your machine).
- **Wake word** (`voice-wake.mjs`) — always-listening "Jarvis" trigger via
  Picovoice Porcupine.
- **Natural speech replies** — ElevenLabs neural TTS when a key is present,
  automatic fallback to the macOS `say` voice.

### Web UI

Iron-Man-inspired HUD built with React 19, Vite, Tailwind CSS v4, and
shadcn/ui-style components: boot overlay, animated core, live activity feed of
tool calls, inline confirmation prompts, browser speech recognition for voice
input, and a tool palette showing every connected capability.

### Safety gate

Irreversible or outbound tools are **held for confirmation** before running
(default: sending Telegram messages, composing mail, quitting apps — see
`JARVIS_CONFIRM_TOOLS`). Over REST they are denied unless `autoConfirm: true`;
over WebSocket the server asks the connected client interactively. Content
read from web pages, messages, and emails is treated as untrusted data, and the
agent loop is bounded by `JARVIS_MAX_STEPS` and per-tool timeouts.

## Getting Started

### Prerequisites

- macOS 10.15+ (AppleScript automation requires macOS)
- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Install & build the backend

```bash
cd applescript-mcp
npm install && npm run build
```

### 2. Configure

```bash
cp .env.example .env
# then edit .env — at minimum set:
#   ANTHROPIC_API_KEY=sk-ant-...
#   JARVIS_MODEL=claude-sonnet-4-5   (any model your account supports)
```

### 3. Run the backend

```bash
node jarvis/server.mjs
```

Verify it's up:

```bash
curl -s localhost:8787/health
curl -s localhost:8787/tools
```

### 4. Pick a client

**Terminal (text):**

```bash
node jarvis/client.mjs
```

**Voice (push-to-talk):**

```bash
brew install sox whisper-cpp
curl -L -o ~/ggml-base.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
node jarvis/voice.mjs        # Enter to talk, Enter to stop
```

**Wake word (always listening):** get a free access key from
[console.picovoice.ai](https://console.picovoice.ai), set
`PICOVOICE_ACCESS_KEY` in `.env`, then:

```bash
node jarvis/voice-wake.mjs   # say "Jarvis" to activate
```

**Web UI:**

```bash
cd ../client
npm install
npm run dev                  # opens on http://localhost:5173
```

The UI connects to `ws://localhost:8787` by default; override with
`VITE_JARVIS_URL` in `client/.env`.

**Standalone (no server):**

```bash
node jarvis/brain.mjs "what's my battery level?"
node jarvis/brain.mjs        # interactive REPL
```

### One-time extras

- **Telegram user-account tools** need a one-time login:
  `node telegram-login.mjs` (session is stored in the gitignored
  `telegram-auth.json`).
- **macOS permissions** — the first time a tool touches an app, macOS will ask
  for Automation/Accessibility permission; grant it in
  System Settings → Privacy & Security.

## HTTP / WebSocket API

| Endpoint | Description |
| --- | --- |
| `GET /health` | `{ ok, provider, model, tools, sessions }` |
| `GET /tools` | `[{ name, description }]` |
| `POST /chat` | body `{ text, sessionId?, autoConfirm?, speak? }` → `{ reply, steps, sessionId }` |
| WebSocket | send `{type:"chat", text, sessionId?}`; receive `step`, `confirm`, `final`, `error`; answer a `confirm` with `{type:"confirm", id, allow}` |

Example:

```bash
curl -s localhost:8787/chat -H 'content-type: application/json' \
  -d '{"text":"open youtube and find the latest claude videos","autoConfirm":true}'
```

## Configuration Reference

All settings live in `applescript-mcp/.env` (see
[`.env.example`](applescript-mcp/.env.example) for the full annotated list).

| Env | Purpose | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Claude access (required) | — |
| `JARVIS_MODEL` | Claude model id | `claude-sonnet-4-5` |
| `JARVIS_PROVIDER` | LLM provider | `anthropic` |
| `JARVIS_PORT` | backend port | `8787` |
| `JARVIS_MAX_TOKENS` | reply length cap | `1024` |
| `JARVIS_CONFIRM_TOOLS` | comma list of confirmation-gated tools | telegram/mail/quit |
| `JARVIS_MAX_STEPS` | agent loop step limit | `15` |
| `JARVIS_TOOL_TIMEOUT_MS` | per-tool timeout | `30000` |
| `JARVIS_SILENT` | `1` disables spoken replies | off |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | neural TTS | fallback to `say` |
| `JARVIS_VOICE` | macOS fallback voice | `Daniel` |
| `WHISPER_BIN` / `WHISPER_MODEL` / `REC_BIN` | local voice input | `whisper-cli` / `~/ggml-base.en.bin` / `sox` |
| `PICOVOICE_ACCESS_KEY` | wake-word detection | — |
| `VITE_JARVIS_URL` (client) | backend WebSocket URL | `ws://localhost:8787` |

## Tech Stack

- **Backend** — Node.js (ESM), Express 5, `ws`, `@anthropic-ai/sdk`,
  `@modelcontextprotocol/sdk`, node-cron, GramJS (`telegram`)
- **MCP server** — TypeScript, AppleScript via `osascript`
- **Voice** — whisper.cpp + SoX (input), Picovoice Porcupine (wake word),
  ElevenLabs / macOS `say` (output)
- **Web UI** — React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui-style
  components, lucide-react

## Development

```bash
# MCP server + backend
cd applescript-mcp
npm run build          # compile TypeScript
npm test               # build + node --test
node smoke.mjs         # smoke-test the MCP server
node try-tool.mjs      # invoke a single tool by hand

# Web UI
cd client
npm run dev            # dev server with HMR
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run build          # production build
```

## Security Notes

- `.env`, `telegram-auth.json`, and local runtime data (`.jarvis/`) are
  gitignored — never commit them.
- Everything the agent reads from external sources (web pages, emails,
  messages) is treated as untrusted input, and outbound actions sit behind the
  confirmation gate.
- Voice transcription runs fully locally; only the conversation text goes to
  the LLM provider.

## Acknowledgements

The MCP server builds on
[joshrutkowski/applescript-mcp](https://github.com/joshrutkowski/applescript-mcp)
(MIT), extended here with Chrome, Telegram, Contacts, Files, Music, Screen,
and Messages tooling plus the Jarvis agent backend.

## License

MIT — see [LICENSE](applescript-mcp/LICENSE).
