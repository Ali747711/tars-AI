import { useCallback, useEffect, useRef, useState } from "react"

export type Entry =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "jarvis"; text: string }
  | { id: string; kind: "step"; tool: string; args: unknown }
  | { id: string; kind: "error"; text: string }

export type ConfirmRequest = { id: string; tool: string; args: unknown }

export type JarvisStatus = "connecting" | "open" | "closed"

const uid = () => crypto.randomUUID()

/**
 * Connects to the Jarvis backend over WebSocket, exposing the conversation
 * timeline, pending confirmations, and a send() action. Auto-reconnects.
 */
export function useJarvis(url: string) {
  const [status, setStatus] = useState<JarvisStatus>("connecting")
  const [entries, setEntries] = useState<Entry[]>([])
  const [pending, setPending] = useState<ConfirmRequest | null>(null)
  const [busy, setBusy] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const sessionId = useRef(uid())
  const reconnectTimer = useRef<number | null>(null)
  const closed = useRef(false)
  // id of the jarvis entry currently being streamed into, if any
  const draftId = useRef<string | null>(null)

  const connect = useCallback(() => {
    setStatus("connecting")
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setStatus("open")
    ws.onerror = () => ws.close()
    ws.onclose = () => {
      setStatus("closed")
      if (!closed.current) {
        reconnectTimer.current = window.setTimeout(connect, 1500)
      }
    }
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      switch (msg.type) {
        case "token": {
          const delta: string = msg.text ?? ""
          if (!draftId.current) {
            const id = uid()
            draftId.current = id
            setEntries((e) => [...e, { id, kind: "jarvis", text: delta }])
          } else {
            const did = draftId.current
            setEntries((e) =>
              e.map((it) =>
                it.id === did && it.kind === "jarvis" ? { ...it, text: it.text + delta } : it
              )
            )
          }
          break
        }
        case "step":
          // a tool call ends the current streamed segment
          draftId.current = null
          setEntries((e) => [...e, { id: uid(), kind: "step", tool: msg.tool, args: msg.args }])
          break
        case "confirm":
          setPending({ id: msg.id, tool: msg.tool, args: msg.args })
          break
        case "final": {
          const did = draftId.current
          draftId.current = null
          setEntries((e) =>
            did
              ? e.map((it) =>
                  it.id === did && it.kind === "jarvis" ? { ...it, text: msg.reply } : it
                )
              : [...e, { id: uid(), kind: "jarvis", text: msg.reply }]
          )
          setBusy(false)
          break
        }
        case "error":
          draftId.current = null
          setEntries((e) => [...e, { id: uid(), kind: "error", text: msg.message }])
          setBusy(false)
          break
      }
    }
  }, [url])

  useEffect(() => {
    closed.current = false
    connect()
    return () => {
      closed.current = true
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((text: string) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    draftId.current = null
    setEntries((e) => [...e, { id: uid(), kind: "user", text }])
    setBusy(true)
    ws.send(JSON.stringify({ type: "chat", text, sessionId: sessionId.current }))
  }, [])

  const respondConfirm = useCallback(
    (allow: boolean) => {
      const ws = wsRef.current
      if (!ws || !pending) return
      ws.send(JSON.stringify({ type: "confirm", id: pending.id, allow }))
      setPending(null)
    },
    [pending]
  )

  return { status, entries, pending, busy, send, respondConfirm }
}
