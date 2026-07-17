# Tests for the MCP -> Anthropic tool-result translation.
#
# Regression: screen_capture returns [image, text]; the SDK's default resolver
# forwarded MCP's raw image shape and Anthropic 400'd with
# "tool_result.content.0.image.source: Field required", poisoning the session.

import json
import sys
from pathlib import Path

import mcp.types as mcp_types
import pytest
from livekit.agents import ToolError
from livekit.agents.llm.mcp import MCPToolResultContext

sys.path.insert(0, str(Path(__file__).parent.parent))

from mcp_result import MAX_IMAGE_B64_CHARS, anthropic_tool_result_resolver  # noqa: E402


def make_ctx(content: list) -> MCPToolResultContext:
    return MCPToolResultContext(
        tool_name="screen_capture",
        arguments={},
        result=mcp_types.CallToolResult(content=content),
    )


def image(data: str = "QUJD", mime: str = "image/jpeg") -> mcp_types.ImageContent:
    return mcp_types.ImageContent(type="image", data=data, mimeType=mime)


def text(body: str = "Screenshot captured.") -> mcp_types.TextContent:
    return mcp_types.TextContent(type="text", text=body)


def test_image_becomes_anthropic_source_block() -> None:
    """The exact shape that used to 400: image + text from screen_capture."""
    blocks = json.loads(anthropic_tool_result_resolver(make_ctx([image(), text()])))

    assert blocks == [
        {
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg", "data": "QUJD"},
        },
        {"type": "text", "text": "Screenshot captured."},
    ]
    # The bug was a bare "data" key with no "source".
    assert "data" not in blocks[0]


def test_text_only_result() -> None:
    blocks = json.loads(anthropic_tool_result_resolver(make_ctx([text("Battery at 80%.")])))
    assert blocks == [{"type": "text", "text": "Battery at 80%."}]


def test_oversized_image_degrades_to_text() -> None:
    """Too-large images must not 400 the conversation."""
    blocks = json.loads(
        anthropic_tool_result_resolver(make_ctx([image(data="x" * (MAX_IMAGE_B64_CHARS + 1))]))
    )
    assert blocks[0]["type"] == "text"
    assert "too large" in blocks[0]["text"]


def test_unsupported_media_type_degrades_to_text() -> None:
    blocks = json.loads(anthropic_tool_result_resolver(make_ctx([image(mime="image/tiff")])))
    assert blocks[0]["type"] == "text"
    assert "unsupported" in blocks[0]["text"]


def test_empty_result_raises_tool_error() -> None:
    with pytest.raises(ToolError):
        anthropic_tool_result_resolver(make_ctx([]))
