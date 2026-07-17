# Function tools that bridge the LiveKit agent to the Jarvis Node backend's
# REST API, so voice and web UI share one memory, activity log, and scheduler.

from datetime import date, timedelta

import httpx
from livekit.agents import function_tool

import settings


async def _get(path: str, params: dict | None = None):
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(f"{settings.BACKEND_URL}{path}", params=params)
        res.raise_for_status()
        return res.json()


async def _post(path: str, body: dict):
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(f"{settings.BACKEND_URL}{path}", json=body)
        res.raise_for_status()
        return res.json()


BACKEND_DOWN = "The Jarvis backend is not reachable, sir — memory is offline right now."


@function_tool()
async def remember_fact(fact: str) -> str:
    """Save a durable fact about the user to long-term memory (preferences, names, projects, routines)."""
    try:
        await _post("/memory", {"text": fact})
        return f"Noted: {fact}"
    except Exception:
        return BACKEND_DOWN


@function_tool()
async def search_memory(query: str = "") -> str:
    """Search the user's saved long-term memories. Empty query lists the most recent facts."""
    try:
        items = await _get("/memory", {"query": query, "limit": 8})
    except Exception:
        return BACKEND_DOWN
    if not items:
        return "No matching memories."
    return "\n".join(f"- {m['text']}" for m in items)


@function_tool()
async def recall_activity(days: int = 2, query: str = "") -> str:
    """Look up past interactions from the activity log (what was asked, which tools ran, what was answered).

    Args:
        days: How many days back to search, including today (1-14).
        query: Optional case-insensitive text filter.
    """
    days = max(1, min(int(days), 14))
    q = query.lower().strip()
    lines: list[str] = []
    try:
        for ago in range(days - 1, -1, -1):
            day = (date.today() - timedelta(days=ago)).isoformat()
            for e in await _get("/log", {"day": day, "limit": 500}):
                text = f"{e.get('user', '')} {e.get('reply', '')}"
                if q and q not in text.lower():
                    continue
                tools = ", ".join(s["tool"] for s in e.get("steps") or [])
                suffix = f" [tools: {tools}]" if tools else ""
                lines.append(f"- {day}: {e.get('user', '')} -> {str(e.get('reply', ''))[:120]}{suffix}")
    except Exception:
        return BACKEND_DOWN
    if not lines:
        return "No matching activity in that period."
    return "\n".join(lines[-15:])


@function_tool()
async def create_routine(cron: str, prompt: str, name: str = "") -> str:
    """Schedule a recurring routine that Jarvis runs automatically.

    Args:
        cron: 5-field cron expression (min hour day month weekday), e.g. '45 8 * * 1-5' for 8:45am on weekdays.
        prompt: What Jarvis should do when the routine runs.
        name: Short optional name for the routine.
    """
    try:
        r = await _post("/routines", {"name": name, "cron": cron, "prompt": prompt})
        return f"Routine \"{r.get('name', name or prompt)}\" scheduled ({cron})."
    except Exception:
        return BACKEND_DOWN


JARVIS_TOOLS = [remember_fact, search_memory, recall_activity, create_routine]
