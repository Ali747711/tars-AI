# Jarvis LiveKit voice agent — Option A: this agent owns the conversation loop.
#
#   mic/phone/browser ⇄ LiveKit ⇄ this worker (runs on the Mac)
#     STT: local whisper.cpp server (same one the Node voice client uses)
#     LLM: Claude (Anthropic API)
#     TTS: ElevenLabs flash v2.5 (same voice as the rest of Jarvis)
#     Tools: all applescript-mcp Mac tools via MCP, plus memory/activity/
#            routine tools that call the Node backend's REST API
#
# Run without any LiveKit account (local mic/speaker):
#   .venv/bin/python agent.py console
# Run against LiveKit Cloud (needs LIVEKIT_URL / API key / secret in .env):
#   .venv/bin/python agent.py dev
#
# Outbound tools (telegram/mail/quit) are excluded by default — voice mode has
# no hard confirmation gate. Override with JARVIS_VOICE_BLOCKED_TOOLS.

import logging

from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, mcp
from livekit.plugins import anthropic, elevenlabs, silero

import settings
from jarvis_tools import JARVIS_TOOLS
from mcp_result import anthropic_tool_result_resolver
from tool_events import attach_tool_events
from whisper_stt import LocalWhisperSTT, ensure_whisper_server

logger = logging.getLogger("jarvis-agent")


def build_mac_toolset() -> mcp.MCPToolset:
    """All applescript-mcp tools, minus the blocked (outbound/irreversible) ones."""
    toolset = mcp.MCPToolset(
        id="mac",
        mcp_server=mcp.MCPServerStdio(
            command="node",
            args=[settings.MCP_SERVER_PATH],
            # Without this, image results (screen_capture) reach Anthropic
            # malformed and 400 the whole conversation — see mcp_result.py.
            tool_result_resolver=anthropic_tool_result_resolver,
        ),
    )
    return toolset.filter_tools(lambda tool: tool.name not in settings.BLOCKED_TOOLS)


class JarvisAgent(Agent):
    def __init__(self, *, mac_tools: bool = True) -> None:
        tools = [*JARVIS_TOOLS]
        if mac_tools:
            tools.append(build_mac_toolset())
        super().__init__(instructions=settings.SYSTEM_PROMPT, tools=tools)


server = AgentServer()


@server.rtc_session()
async def jarvis(ctx: agents.JobContext) -> None:
    if not ensure_whisper_server():
        logger.error(
            "whisper-server unavailable (model at %s) — cannot transcribe",
            settings.WHISPER_MODEL_PATH,
        )
        raise RuntimeError("whisper-server failed to start")

    session = AgentSession(
        vad=silero.VAD.load(min_silence_duration=0.5),
        stt=LocalWhisperSTT(),
        llm=anthropic.LLM(model=settings.MODEL),
        tts=elevenlabs.TTS(
            voice_id=settings.ELEVENLABS_VOICE_ID,
            model=settings.ELEVENLABS_MODEL,
        ),
    )
    # Stream tool-call activity to the browser Voice page (started/ended chips).
    attach_tool_events(session, ctx.room)

    await session.start(room=ctx.room, agent=JarvisAgent())
    await session.generate_reply(
        instructions="Greet the user briefly, in character, and ask how you can help."
    )


if __name__ == "__main__":
    agents.cli.run_app(server)
