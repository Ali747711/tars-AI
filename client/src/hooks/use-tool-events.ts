import { useEffect, useState } from "react"
import { RoomEvent, type Room } from "livekit-client"

export type ToolStatus = "running" | "done" | "error" | "cancelled"

export type ToolEvent = {
  callId: string
  name: string
  status: ToolStatus
  ts: number
}

const TOPIC = "jarvis.tool"

/**
 * Subscribe to the agent's tool-call lifecycle, published on the `jarvis.tool`
 * data topic (see livekit-agent/tool_events.py). Returns tool calls in arrival
 * order, each flipping from "running" to its final status in place.
 */
export function useToolEvents(room: Room | undefined): ToolEvent[] {
  const [events, setEvents] = useState<ToolEvent[]>([])

  useEffect(() => {
    if (!room) return
    const decoder = new TextDecoder()

    const onData = (payload: Uint8Array, _p?: unknown, _k?: unknown, topic?: string) => {
      if (topic !== TOPIC) return
      let msg: { kind?: string; callId?: string; name?: string; status?: ToolStatus }
      try {
        msg = JSON.parse(decoder.decode(payload))
      } catch {
        return
      }
      if (!msg.callId) return

      setEvents((prev) => {
        if (msg.kind === "started") {
          return [
            ...prev,
            { callId: msg.callId!, name: msg.name ?? "tool", status: "running", ts: Date.now() },
          ]
        }
        if (msg.kind === "ended") {
          return prev.map((e) =>
            e.callId === msg.callId ? { ...e, status: msg.status ?? "done" } : e
          )
        }
        return prev
      })
    }

    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room])

  return events
}
