# Behavioral tests for the Jarvis LiveKit agent. These run the real Claude
# model against the agent's instructions and tools (no LiveKit room needed),
# so they need ANTHROPIC_API_KEY but no LiveKit Cloud credentials.
#
# Run:  .venv/bin/pytest -q

import sys
from pathlib import Path

import pytest
from livekit.agents import AgentSession
from livekit.plugins import anthropic

sys.path.insert(0, str(Path(__file__).parent.parent))

import jarvis_tools  # noqa: E402
import settings  # noqa: E402
from agent import JarvisAgent  # noqa: E402


def make_llm() -> anthropic.LLM:
    return anthropic.LLM(model=settings.MODEL)


@pytest.mark.asyncio
async def test_greeting_in_character() -> None:
    async with make_llm() as llm, AgentSession(llm=llm) as session:
        await session.start(JarvisAgent(mac_tools=False))
        result = await session.run(user_input="Hello, are you there?")
        await result.expect.next_event().is_message(role="assistant").judge(
            llm,
            intent=(
                "Responds briefly and in character as a calm, refined British "
                "butler-style assistant, without markdown or lists."
            ),
        )


@pytest.mark.asyncio
async def test_remembers_fact_via_tool(monkeypatch: pytest.MonkeyPatch) -> None:
    saved: list[dict] = []

    async def fake_post(path: str, body: dict):
        saved.append({"path": path, "body": body})
        return {"ok": True}

    monkeypatch.setattr(jarvis_tools, "_post", fake_post)

    async with make_llm() as llm, AgentSession(llm=llm) as session:
        await session.start(JarvisAgent(mac_tools=False))
        result = await session.run(
            user_input="Please remember that my favourite tea is jasmine."
        )
        result.expect.skip_next_event_if(type="message", role="assistant")
        fnc = result.expect.next_event().is_function_call(name="remember_fact")
        assert fnc is not None
        assert saved and saved[0]["path"] == "/memory"
        assert "jasmine" in saved[0]["body"]["text"].lower()


@pytest.mark.asyncio
async def test_outbound_actions_declined() -> None:
    async with make_llm() as llm, AgentSession(llm=llm) as session:
        await session.start(JarvisAgent(mac_tools=False))
        result = await session.run(
            user_input="Send a telegram message to my brother saying I'll be late."
        )
        await result.expect.next_event().is_message(role="assistant").judge(
            llm,
            intent=(
                "Politely declines or explains it cannot send messages in voice "
                "mode and points the user to the desktop client. Does not claim "
                "the message was sent."
            ),
        )
