# Translate MCP tool results into content blocks the Anthropic API accepts.
#
# Why this exists: the SDK's default resolver dumps MCP content objects raw
# (livekit/agents/llm/mcp.py: "TODO(theomonnom): handle images & binary
# messages"). When a tool returns more than one content item, the provider
# formatter passes that JSON list straight through to Anthropic — so MCP's
# image shape {"type":"image","data":...,"mimeType":...} arrives where
# Anthropic requires {"type":"image","source":{...}} and the request 400s with
# "tool_result.content.0.image.source: Field required". That poisons the chat
# context: every later turn resends the bad message and fails too.
#
# screen_capture is the tool that trips this (image + text). Returning a JSON
# list here is deliberate — the formatter parses it and forwards the blocks
# verbatim, which is what lets Claude actually see the screenshot.
#
# Anthropic-specific by design; this agent runs on anthropic.LLM.

import json
from typing import Any

from livekit.agents import ToolError
from livekit.agents.llm.mcp import MCPToolResultContext

# Anthropic rejects images over 5MB. Screenshots are downscaled at the source
# (applescript-mcp screen.ts), but guard anyway: a too-large image is replaced
# with an explanation instead of a 400 that would break the conversation.
MAX_IMAGE_B64_CHARS = 4_000_000

_ANTHROPIC_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


def _image_block(item: Any) -> dict[str, Any]:
    data = getattr(item, "data", "") or ""
    media_type = getattr(item, "mimeType", "") or ""

    if media_type not in _ANTHROPIC_IMAGE_TYPES:
        return {"type": "text", "text": f"[image in unsupported format {media_type or 'unknown'}]"}
    if len(data) > MAX_IMAGE_B64_CHARS:
        return {
            "type": "text",
            "text": "[image too large to send; ask the user to describe what is on screen]",
        }

    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media_type, "data": data},
    }


def anthropic_tool_result_resolver(ctx: MCPToolResultContext) -> str:
    """Convert an MCP CallToolResult into Anthropic tool_result content blocks."""
    blocks: list[dict[str, Any]] = []

    for item in ctx.result.content:
        item_type = getattr(item, "type", None)
        if item_type == "text":
            blocks.append({"type": "text", "text": getattr(item, "text", "")})
        elif item_type == "image":
            blocks.append(_image_block(item))
        else:
            # audio / embedded resources / anything new: describe rather than
            # forward something Anthropic cannot parse.
            blocks.append({"type": "text", "text": f"[{item_type or 'unknown'} content omitted]"})

    if not blocks:
        raise ToolError(
            f"Tool '{ctx.tool_name}' completed without producing a result. "
            "This might indicate an issue with internal processing."
        )

    return json.dumps(blocks)
