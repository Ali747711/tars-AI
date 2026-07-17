# Local speech-to-text for LiveKit using the same whisper.cpp server as the
# Node voice client: free, offline, and the model stays loaded in RAM.
#
# LocalWhisperSTT is a non-streaming STT; AgentSession wraps it with VAD
# (StreamAdapter) so it transcribes each utterance once the user stops talking.

import asyncio
import atexit
import re
import subprocess
import time

import httpx
from livekit import rtc
from livekit.agents import APIConnectionError, stt
from livekit.agents.types import NOT_GIVEN, APIConnectOptions, NotGivenOr

import settings

_NOISE_RE = re.compile(r"\[[^\]]*\]|\([^)]*\)")
_server_proc: subprocess.Popen | None = None


def _reachable(timeout: float = 0.5) -> bool:
    try:
        httpx.get(settings.WHISPER_URL, timeout=timeout)
        return True
    except Exception:
        return False


def ensure_whisper_server(ready_timeout: float = 20.0) -> bool:
    """Reuse a whisper-server already on the port, otherwise spawn one."""
    global _server_proc
    if _reachable():
        return True
    try:
        _server_proc = subprocess.Popen(
            [
                settings.WHISPER_SERVER_BIN,
                "-m", settings.WHISPER_MODEL_PATH,
                "--host", "127.0.0.1",
                "--port", str(settings.WHISPER_PORT),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError:
        return False
    atexit.register(stop_whisper_server)
    deadline = time.monotonic() + ready_timeout
    while time.monotonic() < deadline:
        if _server_proc.poll() is not None:
            return False  # died during startup (bad model path, port clash…)
        if _reachable():
            return True
        time.sleep(0.25)
    stop_whisper_server()
    return False


def stop_whisper_server() -> None:
    global _server_proc
    if _server_proc is not None:
        try:
            _server_proc.terminate()
        except OSError:
            pass
        _server_proc = None


class LocalWhisperSTT(stt.STT):
    """Batch STT against the local whisper.cpp server's /inference endpoint."""

    def __init__(self, *, url: str | None = None) -> None:
        super().__init__(
            capabilities=stt.STTCapabilities(streaming=False, interim_results=False)
        )
        self._url = url or settings.WHISPER_URL

    async def _recognize_impl(
        self,
        buffer: rtc.AudioFrame | list[rtc.AudioFrame],
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions,
    ) -> stt.SpeechEvent:
        frame = rtc.combine_audio_frames(buffer)
        wav = frame.to_wav_bytes()
        try:
            async with httpx.AsyncClient(timeout=conn_options.timeout) as client:
                res = await client.post(
                    f"{self._url}/inference",
                    files={"file": ("audio.wav", wav, "audio/wav")},
                    data={"response_format": "json"},
                )
                res.raise_for_status()
                raw = str(res.json().get("text", ""))
        except Exception as e:  # noqa: BLE001 — surfaced as a retryable API error
            raise APIConnectionError(f"whisper-server request failed: {e}") from e

        text = _NOISE_RE.sub("", raw).strip()
        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[stt.SpeechData(language="en", text=text)],
        )
