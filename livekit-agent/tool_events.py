# Stream the agent's tool-call lifecycle to the room so the browser Voice page
# can show what Jarvis is doing in real time. The AgentSession emits
# `tool_execution_updated` for every tool it runs — both the local
# function_tools and the MCP Mac tools — so hooking here covers all of them.
#
# Events go out on the `jarvis.tool` data topic as compact JSON:
#   {"kind": "started", "callId": "...", "name": "screen_capture"}
#   {"kind": "ended",   "callId": "...", "status": "done"|"error"|"cancelled"}
#
# Best-effort: a telemetry failure must never interrupt the conversation.

import asyncio
import json
import logging

from livekit import rtc
from livekit.agents import AgentSession

logger = logging.getLogger("jarvis-agent")

TOOL_TOPIC = "jarvis.tool"


def attach_tool_events(session: AgentSession, room: rtc.Room) -> None:
    """Wire tool-lifecycle events on `session` to data messages on `room`."""

    def publish(payload: dict) -> None:
        try:
            asyncio.create_task(
                room.local_participant.publish_data(
                    json.dumps(payload).encode(), topic=TOOL_TOPIC, reliable=True
                )
            )
        except Exception as e:  # noqa: BLE001 — never break the turn over telemetry
            logger.debug("tool event publish failed: %s", e)

    @session.on("tool_execution_updated")
    def _on_tool_update(ev) -> None:
        update = ev.update
        if update.type == "tool_call_started":
            call = update.function_call
            publish({"kind": "started", "callId": call.call_id, "name": call.name})
        elif update.type == "tool_call_ended":
            publish({"kind": "ended", "callId": update.call_id, "status": update.status})
